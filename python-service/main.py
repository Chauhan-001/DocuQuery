
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    UploadFile,
    File,
    Query,
    Path as FastAPIPath,
)
from pydantic import BaseModel, Field, field_validator
from qdrant_client import models

from internal_auth import require_internal_token
from text_cleaner import normalize_text
from document_parser import extract_text_from_pdf
from ingest import ingest_document
from qdrant_db import client, COLLECTION_NAME, initialize_collection
from rag import answer_question
from search_document import search_document
from delete_document import delete_document


MAX_FILE_SIZE = 10_000_000  # 10 MB
MAX_TEXT_CHARS = 500_000
DEFAULT_DOCUMENT_ID = "rag-content"


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        yield
    finally:
        client.close()


app = FastAPI(
    title="DocuQuery API",
    description="Document ingestion and semantic retrieval service",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------- Shared text processing ----------

def prepare_document_text(text: str) -> str:
    """Normalize extracted text and reject empty content."""
    cleaned_text = normalize_text(text)

    if not cleaned_text:
        raise HTTPException(
            status_code=400,
            detail="No usable text content found in the document.",
        )

    if len(cleaned_text) > MAX_TEXT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Document text exceeds the {MAX_TEXT_CHARS:,} character limit.",
        )

    return cleaned_text


# ---------- Request models ----------

class SearchRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    document_id: str = Field(min_length=1, max_length=100)
    limit: int = Field(default=3, ge=1, le=10)
    score_threshold: float = Field(default=0.4, ge=0.0, le=1.0)

    @field_validator("question", "document_id")
    @classmethod
    def strip_and_reject_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank")
        return value


class IngestRequest(BaseModel):
    document_id: str = Field(min_length=1, max_length=100)
    source: str = Field(min_length=1, max_length=300)
    text: str = Field(min_length=1, max_length=100_000)

    @field_validator("document_id", "source", "text")
    @classmethod
    def strip_and_reject_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank")
        return value


class AnswerRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    document_id: str = Field(min_length=1, max_length=100)
    limit: int = Field(default=3, ge=1, le=10)
    score_threshold: float = Field(default=0.4, ge=0.0, le=1.0)
    use_hyde: bool = True

    @field_validator("question", "document_id")
    @classmethod
    def strip_and_reject_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank")
        return value


# ---------- Health ----------

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "DocuQuery",
    }


# ---------- Search ----------

@app.post("/search", dependencies=[Depends(require_internal_token)])
def search(request: SearchRequest):
    try:
        results = search_document(
            question=request.question,
            document_id=request.document_id,
            limit=request.limit,
            score_threshold=request.score_threshold,
        )

        return {
            "question": request.question,
            "results": [
                {
                    "text": result.payload["text"],
                    "source": result.payload["source"],
                    "chunk_index": result.payload["chunk_index"],
                    "score": result.score,
                }
                for result in results
            ],
            "count": len(results),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Search failed. Check the service logs.",
        ) from exc


# ---------- Text ingestion ----------

@app.post("/ingest", dependencies=[Depends(require_internal_token)])
def ingest(request: IngestRequest):
    try:
        cleaned_text = prepare_document_text(request.text)

        point_ids = ingest_document(
            text=cleaned_text,
            source=request.source,
            document_id=request.document_id,
        )

        return {
            "document_id": request.document_id,
            "source": request.source,
            "chunks_stored": len(point_ids),
            "message": "Document ingested successfully",
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Ingestion failed. Check the service logs.",
        ) from exc


# ---------- File ingestion: TXT and PDF ----------

@app.post("/ingest-file", dependencies=[Depends(require_internal_token)])
async def ingest_file_endpoint(
    document_id: str = Query(min_length=1, max_length=100),
    file: UploadFile = File(...),
):
    try:
        document_id = document_id.strip()

        if not document_id:
            raise HTTPException(
                status_code=422,
                detail="Document ID cannot be blank.",
            )

        filename = Path(file.filename or "").name

        if not filename:
            raise HTTPException(
                status_code=400,
                detail="A filename is required.",
            )

        suffix = Path(filename).suffix.lower()

        if suffix not in {".txt", ".pdf"}:
            raise HTTPException(
                status_code=400,
                detail="Only .txt and .pdf files are supported.",
            )

        content = await file.read(MAX_FILE_SIZE + 1)

        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="File exceeds the 10 MB limit.",
            )

        if not content:
            raise HTTPException(
                status_code=400,
                detail="File cannot be empty.",
            )

        if suffix == ".pdf":
            try:
                extracted_text = extract_text_from_pdf(content)

            except ValueError as exc:
                raise HTTPException(
                    status_code=400,
                    detail=str(exc),
                ) from exc

            except Exception as exc:
                raise HTTPException(
                    status_code=400,
                    detail="Could not read this PDF. Check that it is valid.",
                ) from exc

        else:
            try:
                extracted_text = content.decode("utf-8-sig")

            except UnicodeDecodeError as exc:
                raise HTTPException(
                    status_code=400,
                    detail="Text file must use UTF-8 encoding.",
                ) from exc

        cleaned_text = prepare_document_text(extracted_text)

        point_ids = ingest_document(
            text=cleaned_text,
            source=filename,
            document_id=document_id,
        )

        return {
            "document_id": document_id,
            "source": filename,
            "chunks_stored": len(point_ids),
            "message": "File ingested successfully",
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="File ingestion failed. Check the service logs.",
        ) from exc

    finally:
        await file.close()


# ---------- Document deletion ----------

@app.get("/documents/{document_id}", dependencies=[Depends(require_internal_token)])
def get_document_index_status(
    document_id: str = FastAPIPath(min_length=1, max_length=100),
):
    try:
        document_id = document_id.strip()
        if not document_id:
            raise HTTPException(
                status_code=422,
                detail="Document ID cannot be blank.",
            )

        initialize_collection()
        result = client.count(
            collection_name=COLLECTION_NAME,
            count_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="document_id",
                        match=models.MatchValue(value=document_id),
                    ),
                ],
            ),
            exact=True,
        )
        return {"document_id": document_id, "chunk_count": result.count}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Document index status could not be checked.",
        ) from exc


@app.delete("/documents/{document_id}", dependencies=[Depends(require_internal_token)])
async def delete_document_endpoint(
    document_id: str = FastAPIPath(min_length=1, max_length=100),
):
    try:
        document_id = document_id.strip()

        if not document_id:
            raise HTTPException(
                status_code=422,
                detail="Document ID cannot be blank.",
            )
        if document_id == DEFAULT_DOCUMENT_ID:
            raise HTTPException(
                status_code=409,
                detail="The shared default document cannot be deleted.",
            )

        delete_document(document_id)

        return {
            "document_id": document_id,
            "message": "Document deleted successfully",
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Document deletion failed. Check the service logs.",
        ) from exc


# ---------- RAG answer generation ----------

@app.post("/answer", dependencies=[Depends(require_internal_token)])
def answer(request: AnswerRequest):
    try:
        return answer_question(
            question=request.question,
            document_id=request.document_id,
            limit=request.limit,
            score_threshold=request.score_threshold,
            use_hyde=request.use_hyde,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Answer generation failed. Check the service logs.",
        ) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
    )
