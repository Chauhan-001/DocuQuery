# DocuQuery

**Ask better questions of your PDFs. See the evidence behind every answer.**

DocuQuery is a full-stack retrieval-augmented generation (RAG) workspace for researching documents. Upload a PDF, ask a question, and get an answer grounded in retrieved passages with source and chunk citations. Unlike a black-box chatbot, DocuQuery also exposes the retrieval pipeline so you can inspect what was found, compare search settings, and understand how an answer was produced.

> **Project status:** demo/reference implementation. Access is session-scoped and the Node gateway is designed for a single instance. It is not a multi-tenant production authentication system.

## Contents

- [Why DocuQuery](#why-docuquery)
- [Features](#features)
- [Product tour](#product-tour)
- [Architecture](#architecture)
- [How retrieval works](#how-retrieval-works)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Security and privacy](#security-and-privacy)
- [Limits](#limits)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## Why DocuQuery

Most RAG demos stop at “ask a question, get an answer.” DocuQuery treats retrieval as a first-class part of the product:

- **Evidence-first answers.** Answers are generated from retrieved passages, with source and chunk references. If no relevant evidence is found, the service abstains instead of inventing an answer.
- **Transparent retrieval.** The RAG Explorer shows query rewriting, decomposition, HyDE, dense search, BM25, reciprocal rank fusion, hydration, and cross-encoder reranking.
- **Tunable search.** The Playground lets you adjust Top-K and similarity threshold, or compare three retrieval configurations side by side.
- **Document-scoped privacy.** Every uploaded document belongs to the browser session that uploaded it. Other sessions receive a non-disclosing `404`.
- **Hybrid retrieval.** Semantic search and keyword search are fused, then reranked with a cross-encoder for stronger evidence selection.
- **Local or cloud vector storage.** Use embedded Qdrant for development or Qdrant Cloud for deployment.
- **A gateway, not a direct AI endpoint.** Node owns sessions, ownership, rate limits, CORS, and deletion sequencing. Python is an internal service protected by a shared token.

## Features

- PDF upload with drag-and-drop, a 10 MB limit, and PDF magic-byte validation.
- Text extraction with `pypdf` plus OCR fallback through PyMuPDF/Tesseract for pages with little extractable text.
- Sentence-aware chunking with a 500-character target and 100-character overlap.
- 384-dimensional embeddings from `sentence-transformers/all-MiniLM-L6-v2`.
- HyDE query expansion, LLM query rewriting, and multi-part query decomposition.
- Dense Qdrant search plus BM25 lexical search.
- Reciprocal Rank Fusion (RRF, `k=60`) to combine candidate rankings.
- Cross-encoder reranking with `cross-encoder/ms-marco-MiniLM-L6-v2`.
- Evidence context deduplication and optional LLM context compression.
- Grounded answers through Groq, with source/chunk citations.
- Retrieval pipeline traces for debugging and the RAG Explorer.
- Session-scoped document library, public read-only sample document, and retryable deletion.
- Production cookie handling for cross-site Vercel + Render deployments.
- Rate limiting, CORS allowlisting, Origin/Referer checks, and an internal Node-to-Python token.

## Product tour

| Page | What it does |
|---|---|
| **Research** | Upload or select a document, ask a question, read the grounded answer, and browse cited evidence. |
| **Documents** | Manage the session’s document library, inspect chunk counts and status, and delete private documents. |
| **RAG Explorer** | Run a question through the retrieval pipeline and inspect the live trace for each stage. |
| **Playground** | Tune Top-K and similarity threshold, or compare multiple retrieval configurations. |

The bundled public sample, `rag-content.pdf`, appears in every session. It can be queried but cannot be deleted.

## Architecture

```text
┌──────────────────────────────────────────────┐
│ Browser: React + TypeScript + Vite           │
│ credentialed fetch + HttpOnly dq_sid cookie  │
└──────────────────────┬───────────────────────┘
                       │ HTTPS
                       ▼
┌──────────────────────────────────────────────┐
│ Node.js + Express gateway                    │
│                                              │
│ sessions · ownership · CORS/CSRF checks      │
│ rate limits · document metadata · deletion   │
└──────────────────────┬───────────────────────┘
                       │ X-Internal-Token
                       ▼
┌──────────────────────────────────────────────┐
│ Python + FastAPI RAG service                 │
│                                              │
│ PDF parsing · chunking · embeddings          │
│ dense + BM25 retrieval · RRF · reranking     │
│ context compression · answer generation      │
└───────────────┬──────────────────────┬───────┘
                │                      │
                ▼                      ▼
        ┌───────────────┐      ┌───────────────┐
        │ Qdrant        │      │ Groq API      │
        │ local/Cloud   │      │ LLM inference │
        └───────────────┘      └───────────────┘
```

### Request flow

1. The browser calls the Node API with the session cookie included.
2. Node derives the owner from the session and checks document visibility, request origin, and rate limits.
3. Node proxies ingest, search, answer, and delete operations to Python with `X-Internal-Token`.
4. Python reads/writes Qdrant and calls Groq for rewrite, HyDE, compression, and answer generation.
5. Node returns only documents and results visible to the current session.

Document metadata and sessions live in Node process memory. Qdrant stores the chunk vectors and payloads. This keeps the demo simple, but it means a Node restart loses sessions and ownership metadata. See [Known limitations](#known-limitations).

## How retrieval works

DocuQuery uses a multi-stage retrieval pipeline rather than a single vector lookup:

1. **Rewrite** the user question into a standalone search query.
2. **Decompose** complex questions into up to four focused sub-questions.
3. **Generate a HyDE passage** for each sub-question and embed it for dense search. If HyDE fails, retrieval falls back to the real query embedding.
4. **Dense search** Qdrant for semantically similar chunks scoped to the selected document.
5. **BM25 search** the same document for lexical matches.
6. **Fuse** both rankings with Reciprocal Rank Fusion (`k=60`).
7. **Hydrate** the fused point IDs with their text and source metadata.
8. **Scope-check** hydrated points again before any content reaches the model.
9. **Rerank** candidates with a cross-encoder using the actual question.
10. **Merge and deduplicate** results across sub-questions, keeping each chunk’s best score.
11. **Build context** with source/chunk labels and exact-sentence deduplication.
12. **Compress** the context when possible, falling back to the original context.
13. **Answer** from the evidence, or abstain when retrieval returns nothing useful.

The RAG Explorer displays a live trace of these stages. Scores returned by the API are similarity/reranker scores, not probabilities or confidence estimates.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite 8, Tailwind CSS 4, React Router 7, Vitest |
| Gateway | Node.js 20.19+ or 22.12+, Express 5, `express-session`, Multer, CORS |
| RAG service | Python 3.11, FastAPI, Pydantic, Qdrant client |
| Retrieval | `sentence-transformers`, `rank-bm25`, reciprocal rank fusion, cross-encoder reranking |
| PDF processing | `pypdf`, PyMuPDF, optional Tesseract OCR |
| Vector store | Qdrant embedded locally or Qdrant Cloud |
| LLM | Groq (`openai/gpt-oss-120b`) |
| Tests | Node test runner, Vitest, Python `unittest` |

## Quick start

### Prerequisites

- **Node.js** `^20.19.0` or `>=22.12.0` (required by Vite 8).
- **Python 3.11** — the repository pins `3.11.15` in `python-service/.python-version` for deployment parity.
- **A [Groq API key](https://console.groq.com/keys)** for answer generation.
- **Qdrant** — not required for local development; embedded Qdrant is the default. Use [Qdrant Cloud](https://cloud.qdrant.io/) for deployment.
- **[Tesseract](https://tesseract-ocr.github.io/tessdoc/Installation.html) with English language data** — optional, but required for OCR on scanned PDF pages.
- Internet access and several hundred MB of free disk space for the first model download.

### 1. Install dependencies

From the repository root:

```bash
cd node-service
npm ci

cd ../frontend
npm ci

cd ../python-service
python -m venv .venv
```

Activate the Python environment:

```bash
# macOS / Linux
source .venv/bin/activate

# Windows PowerShell
.\.venv\Scripts\Activate.ps1
```

Install the Python dependencies:

```bash
python -m pip install -r requirements.txt
```

### 2. Configure the environment

Each service loads its own `.env` file. The root `.env.example` is a combined reference and is **not** loaded automatically.

```bash
cp node-service/.env.example node-service/.env
cp python-service/.env.example python-service/.env
cp frontend/.env.example frontend/.env
```

Set at least these values:

```dotenv
# python-service/.env
GROQ_API_KEY=your_groq_api_key_here
PYTHON_INTERNAL_TOKEN=replace-with-a-shared-dev-token
DOCUQUERY_ENV=development

# node-service/.env
PYTHON_INTERNAL_TOKEN=replace-with-the-same-shared-dev-token
NODE_ENV=development

# frontend/.env
VITE_API_URL=http://localhost:3000
```

For local development, leave `QDRANT_URL` empty to use embedded Qdrant. The default local data directory is `python-service/qdrant_storage`.

### 3. Start the Python service

```bash
cd python-service
uvicorn main:app --host 127.0.0.1 --port 8000
```

The first ingest or search downloads the embedding and reranking models and can take a while. `/health` is intentionally model-free and returns quickly.

### 4. Start the Node gateway

In another terminal:

```bash
cd node-service
npm start
```

The gateway listens on `http://localhost:3000` by default. On the first `/documents` request it provisions the public sample PDF, which can take a moment while the sample is ingested.

### 5. Start the frontend

In a third terminal:

```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

For local development, keep the frontend and API on the same hostname (`localhost`, not a mix of `localhost` and `127.0.0.1`) so the development `SameSite=Lax` cookie is sent.

## Environment variables

### Node gateway

| Variable | Default | Production requirement | Purpose |
|---|---|---|---|
| `NODE_ENV` | `development` | Set to `production` | Enables production secrets, secure cookies, and proxy trust. |
| `PORT` | `3000` | Platform-provided | HTTP port. |
| `PYTHON_API_URL` | `http://127.0.0.1:8000` | Required | Internal Python service URL. |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Required | Comma-separated exact allowed origins. No wildcards or trailing slashes. |
| `SESSION_SECRET` | Ephemeral in development | At least 32 characters | Signs the session cookie. |
| `SESSION_TTL_MS` | `86400000` (24 hours) | Optional | Session lifetime in milliseconds. |
| `PYTHON_INTERNAL_TOKEN` | Development fallback | At least 16 characters | Shared secret sent as `X-Internal-Token`. Must match Python. |
| `MAX_DOCS_PER_SESSION` | `10` | Optional | Maximum uploaded documents per session. |
| `INGEST_RATE_LIMIT` | `6` | Optional | Ingest requests allowed per window. |
| `INGEST_RATE_WINDOW_MS` | `600000` (10 minutes) | Optional | Ingest rate-limit window. |
| `ANSWER_RATE_LIMIT` | `20` | Optional | Answer requests per 60 seconds. |
| `SEARCH_RATE_LIMIT` | `60` | Optional | Search requests per 60 seconds. |
| `DEFAULT_DOCUMENT_PATH` | `../python-service/rag-content.pdf` | Optional | Override the bundled sample PDF path. |

### Python RAG service

| Variable | Default | Production requirement | Purpose |
|---|---|---|---|
| `DOCUQUERY_ENV` | `development` | Set to `production` | Enables production internal-token validation. |
| `GROQ_API_KEY` | None | Required | Groq API key. The service fails at startup if it is missing. |
| `PYTHON_INTERNAL_TOKEN` | Development fallback | At least 16 characters | Must match the Node service. |
| `QDRANT_URL` | Empty | Required for remote Qdrant | Qdrant Cloud or another remote Qdrant endpoint. Remote mode is selected whenever this is non-empty. |
| `QDRANT_API_KEY` | Empty | Required for secured Qdrant | Qdrant API key. Never expose it to the frontend or Node. |
| `QDRANT_STORAGE_PATH` | `python-service/qdrant_storage` | Do not set for remote Qdrant | Embedded Qdrant data directory. |
| `PORT` | `8000` | Platform-provided | Used by `python main.py`; the `uvicorn` command uses `--port` instead. |

### Frontend

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000` | Node API base URL. Vite embeds this at build time, so rebuild/redeploy after changing it. |

## API reference

### Node gateway — default `http://localhost:3000`

Browser requests use the `dq_sid` session cookie. State-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) must include a trusted `Origin` or `Referer`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Node health check. No session required. |
| `GET` | `/health/python` | Proxy the Python health check through Node. |
| `POST` | `/ingest-file` | Upload and ingest a PDF. Multipart field name: `file`. |
| `POST` | `/ingest` | Ingest text with `source` and `text`. |
| `POST` | `/answer` | Generate a grounded answer for a document. |
| `POST` | `/search` | Retrieve chunks for a document and query. |
| `GET` | `/documents` | List the public sample plus the session’s private documents. |
| `GET` | `/documents/:documentId` | Get one visible document’s metadata. |
| `DELETE` | `/documents/:documentId` | Delete an owned private document and its vectors. |

Document IDs are generated server-side. Client-supplied IDs and owner IDs are ignored.

**Answer request body**

```json
{
  "question": "What is the main argument?",
  "document_id": "doc_...",
  "limit": 3,
  "score_threshold": 0.4,
  "use_hyde": true
}
```

**Search request body**

```json
{
  "question": "What is the main argument?",
  "document_id": "doc_...",
  "limit": 3,
  "score_threshold": 0.4
}
```

Node clamps search `limit` to `1–5` and answer `limit` to `1–10`. The public sample uses the fixed ID `rag-content`.

### Python service — internal only

The FastAPI service exposes `/health`, `/search`, `/ingest`, `/ingest-file`, `GET`/`DELETE` `/documents/{document_id}`, and `/answer`. Every route except `/health` requires `X-Internal-Token`. The frontend should only reach Python through the Node gateway.

Python’s `/ingest-file` supports `.pdf` and `.txt`; the public Node endpoint accepts PDFs only.

Common Node error responses include `400` for invalid input, `401`/`403` for failed internal or origin checks, `404` for inaccessible documents, `409` for deletion conflicts, `413` for oversized input, `415` for non-PDF uploads, `429` for rate limits, and `502` when Python is unavailable.

## Security and privacy

- **Session cookie:** `dq_sid` is `HttpOnly` and `SameSite=Lax` locally. In production it becomes `SameSite=None; Secure` so it can be sent from a Vercel frontend to a separate Render API origin.
- **Ownership:** the server derives the owner from the session. Clients cannot choose or override document ownership. Other sessions receive a non-disclosing `404`.
- **Internal boundary:** Python requires `X-Internal-Token` on every sensitive route. The token is never sent to the browser.
- **Origin checks:** CORS allows only exact configured origins, and state-changing requests require a trusted `Origin` or `Referer`.
- **Rate limits:** ingest, answer, and search are limited per session.
- **Public sample:** the bundled sample is visible to every session and cannot be deleted.
- **No accounts:** access control is session-based only. Clearing cookies creates a new session that cannot access the old session’s documents.
- **External processing:** questions and retrieved document context are sent to Groq for answer generation. Do not upload sensitive documents unless that processing is acceptable for your use case.
- **Secrets:** never commit `.env` files, `GROQ_API_KEY`, `QDRANT_API_KEY`, `SESSION_SECRET`, or `PYTHON_INTERNAL_TOKEN`.
- **Answer quality:** generated answers can be wrong. Treat citations as the verification path and check the source passages.

## Limits

| Area | Limit |
|---|---|
| PDF upload | 10 MB, PDF only through the Node API |
| PDF pages | 100 |
| PDF parsing time | 60 seconds, including OCR |
| Text ingestion | 100,000 characters per Node request; 500,000 characters after Python cleaning |
| Documents per session | 10 by default |
| Ingestion rate | 6 attempts per 10 minutes by default |
| Answer rate | 20 requests per minute by default |
| Search rate | 60 requests per minute by default |
| JSON body size | 1 MB |
| Session lifetime | 24 hours by default |
| Search Top-K | 1–5 through Node |
| Answer Top-K | 1–10 through Node |

Similarity and reranker scores are not probabilities. PDFs must contain extractable text; scanned pages require Tesseract and may still fail or be slow.

## Testing

### Node

```bash
cd node-service
npm test
```

### Python

```bash
cd python-service
python -m unittest discover -s tests -t . -v
```

### Frontend

```bash
cd frontend
npm test
npm run build
npx tsc --noEmit
```

The Node suite covers session isolation, ownership, CSRF/CORS behavior, production cookie flags, deletion failure/retry, cleanup compensation, and upload/request limits. The Python suite covers internal-token checks, remote/local Qdrant selection, idempotent collection initialization, lightweight health startup, document-scope filtering, deletion isolation/idempotency, and PDF page/time limits. The frontend suite covers the credentialed API client and formatting helpers.

> The frontend `lint` script is declared in `package.json`, but ESLint is not currently installed or configured. `npx tsc --noEmit` is the verified typecheck.

## Deployment

### Free-tier warning

The frontend and Node gateway can run on free tiers. The Python service cannot realistically run on Render Free’s 512 MB RAM with both ML models enabled. Local measurements were approximately:

- PyTorch import: ~415 MB
- Embedding model loaded: ~526 MB
- Embedding + reranking models loaded: ~622 MB

Lazy loading keeps `/health` and startup light, but the first ingest/search still loads the models. Use a Render instance with at least 2 GB RAM, or move inference to an external service, if you need the full pipeline.

Qdrant Cloud Free is suitable for a small demo, but free clusters suspend after 1 week of inactivity and are deleted after 4 weeks if not reactivated.

### 1. Qdrant Cloud

1. Create a free Qdrant Cloud cluster.
2. Copy its HTTPS URL and API key.
3. Set `QDRANT_URL` and `QDRANT_API_KEY` on the Python service only.
4. Do not set `QDRANT_STORAGE_PATH` for remote Qdrant.
5. The Python service creates the `document_chunks` collection automatically on the first ingest or document-status request with 384-dimensional cosine vectors.

### 2. Python API on Render

- Create a Web Service with **Root Directory** `python-service`.
- Build command: `pip install -r requirements.txt`
- Start command: `python main.py` (binds `0.0.0.0` and reads `PORT`) or `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`
- Render reads Python `3.11.15` from `python-service/.python-version`.
- Set `DOCUQUERY_ENV=production`, `GROQ_API_KEY`, `PYTHON_INTERNAL_TOKEN`, `QDRANT_URL`, and `QDRANT_API_KEY`.
- Keep the Python service private if your Render plan supports private networking. Every sensitive route still requires the internal token.

### 3. Node API on Render

- Create a Web Service with **Root Directory** at the repository root, not `node-service`, so the sibling sample PDF is included.
- Build command: `cd node-service && npm ci`
- Start command: `cd node-service && npm start`
- Health check path: `/health`
- Set `NODE_ENV=production`, `PYTHON_API_URL` to the Python service’s internal/public URL, `FRONTEND_ORIGIN` to the exact Vercel origin, `SESSION_SECRET` (32+ random characters), and `PYTHON_INTERNAL_TOKEN` (16+ random characters, identical to Python).
- The optional `DEFAULT_DOCUMENT_PATH` can point to another deployed copy of `rag-content.pdf`; the default resolves to `../python-service/rag-content.pdf`.
- In production the session cookie is `SameSite=None; Secure`, and `FRONTEND_ORIGIN` must match exactly. Do not use a wildcard.

### 4. Frontend on Vercel

- Import the repository and set **Root Directory** to `frontend`.
- Build command: `npm ci && npm run build`
- Output directory: `dist`
- Set `VITE_API_URL` to the exact Render Node URL, for example `https://docuquery-node.onrender.com`.
- Redeploy after changing `VITE_API_URL`; Vite embeds it at build time.
- `frontend/vercel.json` supplies the SPA fallback for client-side routes such as `/documents`, `/explorer`, and `/playground`.
- Add Vercel preview origins to `FRONTEND_ORIGIN` explicitly if you want preview deployments to call the API.

### 5. Verify the deployment

1. Check Node `/health` and Python `/health`.
2. Load the frontend and confirm the public sample appears.
3. Upload a small PDF and wait for its status to become `ready`.
4. Ask a question and confirm the answer includes source/chunk citations.
5. Try the RAG Explorer and Playground.
6. Delete a private document and confirm it disappears.
7. Confirm a second browser session cannot see the first session’s document.

## Project structure

```text
DocuQuery/
├── frontend/
│   ├── src/
│   │   ├── api/            # credentialed API client and types
│   │   ├── components/     # layout, upload, QA, UI primitives
│   │   ├── pages/          # Research, Documents, Explorer, Playground
│   │   └── hooks/
│   └── vercel.json         # SPA fallback
├── node-service/
│   ├── server.js           # sessions, ownership, gateway, limits
│   └── server.test.js
├── python-service/
│   ├── main.py             # FastAPI routes
│   ├── qdrant_db.py        # local/remote Qdrant configuration
│   ├── rag.py              # retrieval orchestration and answers
│   ├── hybrid_search.py    # dense + BM25 + RRF + reranking
│   ├── embedder.py         # lazy embedding model
│   ├── reranker.py         # lazy cross-encoder
│   ├── tests/              # focused unittest suite
│   ├── requirements.txt
│   └── .python-version
├── .env.example            # combined reference; not auto-loaded
└── README.md
```

## Troubleshooting

| Symptom | Check |
|---|---|
| Python returns `401 Unauthorized` | `PYTHON_INTERNAL_TOKEN` must match exactly in Node and Python. In production it must be at least 16 characters. |
| `403 Request origin is not allowed` | `FRONTEND_ORIGIN` must exactly match the browser origin, including scheme and port. Remove trailing slashes and wildcards. |
| Session is not retained across the frontend and API | In production, use HTTPS, set `NODE_ENV=production`, and allow third-party cookies. Same-site custom domains are more reliable than cross-site cookies. |
| Node returns `502` for search or answer | Confirm Python is running, `PYTHON_API_URL` is correct, and the internal token matches. |
| The public sample is missing | Keep the Node service root at the repository root or set `DEFAULT_DOCUMENT_PATH` to a deployed copy of `rag-content.pdf`. |
| `429 Too many requests` | A per-session ingest, answer, or search limit was reached. Wait for the window to reset or adjust the limits. |
| Qdrant connection errors | Check `QDRANT_URL` and `QDRANT_API_KEY`; confirm the cluster is active and not suspended; do not set `QDRANT_STORAGE_PATH` in remote mode. |
| Python process runs out of memory | Render Free’s 512 MB is insufficient with both models. Use at least 2 GB or external inference. |
| PDF upload is rejected | Check the 10 MB size limit, PDF magic bytes, encryption, page count, parse time, and whether OCR/Tesseract is available. |
| Deep links return 404 on Vercel | Confirm `frontend/vercel.json` is deployed and the Vercel project root is `frontend`. |
| Frontend calls the wrong API | `VITE_API_URL` is embedded at build time. Update it and redeploy the frontend. |

## Known limitations

- **In-memory metadata.** Sessions, rate limits, and document ownership are held in Node process memory. A restart or Render free-tier spin-down loses them.
- **Single Node instance.** Multiple Node instances would not share sessions or metadata.
- **Orphaned vectors.** After a Node restart, Qdrant chunks can outlive their ownership metadata. Plan cleanup or a persistent metadata store for long-running deployments.
- **No user accounts.** Access is session-based only; anyone with a session cookie can access that session’s documents.
- **Synchronous ingestion.** Uploads are processed in the request path. Large PDFs, OCR, and cold model loads can be slow.
- **Memory footprint.** The Python service loads both embedding and reranking models on first inference.
- **Cross-site cookies.** `SameSite=None` can be blocked by browsers that restrict third-party cookies.
- **Free Qdrant policy.** Free clusters can suspend after inactivity and be deleted after prolonged inactivity.
- **Extraction limits.** Scanned PDFs depend on OCR quality and may fail; answers can still be incomplete or incorrect even with citations.

## License

No license file is currently included in this repository. Add a license before distributing the project or accepting external contributions.

## Acknowledgements

- `sentence-transformers/all-MiniLM-L6-v2` for embeddings.
- `cross-encoder/ms-marco-MiniLM-L6-v2` for reranking.
- Qdrant for vector storage and retrieval.
- Groq for LLM inference.
- FastAPI, Express, React, Vite, and the open-source libraries listed in the service manifests.
