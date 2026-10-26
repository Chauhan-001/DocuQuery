import { useState, useCallback, useRef, DragEvent, ChangeEvent } from "react";
import { useUpload } from "../hooks/useDocuments";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/Card";
import { UploadIcon, FileTextIcon, AlertCircleIcon, XIcon, LoaderIcon } from "./icons";
import { cn, formatFileSize } from "../utils";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface UploadAreaProps {
  onSuccess?: (documentId: string, filename: string) => void;
}

export function UploadArea({ onSuccess }: UploadAreaProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading, error: uploadError } = useUpload();

  const validateFile = useCallback((file: File): boolean => {
    if (file.type !== "application/pdf") {
      setFileError("Only PDF files are supported.");
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError(`File size exceeds ${formatFileSize(MAX_FILE_SIZE)} limit.`);
      return false;
    }
    if (file.size === 0) {
      setFileError("File cannot be empty.");
      return false;
    }
    setFileError(null);
    return true;
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (validateFile(file)) {
      setSelectedFile(file);
    }
  }, [validateFile]);

  const handleDrag = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, [handleFileSelect]);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  }, [handleFileSelect]);

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      const response = await upload(selectedFile);
      onSuccess?.(response.document_id, response.source);
      handleRemoveFile();
    } catch {
      // Error handled by upload hook
    }
  };

  return (
    <Card className="research-panel w-full overflow-hidden">
      <CardHeader className="border-b border-[var(--color-border)] px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-300">
            <UploadIcon className="h-3.5 w-3.5" />
          </span>
          Add a document
        </CardTitle>
        <CardDescription className="pl-9 text-[10px] leading-4">
          PDF files · up to 10 MB
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-3">
        <div
          className={cn(
            "relative rounded-xl border border-dashed p-4 text-center transition-all duration-200",
            "focus-within:ring-2 focus-within:ring-[var(--color-focus)]",
            dragActive
              ? "border-emerald-300/60 bg-emerald-300/[0.08] shadow-[0_0_26px_rgba(32,230,160,0.08)]"
              : "border-[var(--color-border)] bg-slate-950/20 hover:border-emerald-300/30 hover:bg-slate-950/35",
            fileError && "border-[var(--color-error)] bg-[var(--color-error-light)]",
            uploading && "opacity-50 pointer-events-none"
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleInputChange}
            className="sr-only"
            disabled={uploading || !!selectedFile}
            aria-label="Choose PDF file"
          />

          {!selectedFile ? (
            <>
              <div className={cn(
                "mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-300 transition-transform",
                dragActive && "scale-110"
              )}>
                <UploadIcon className="h-4 w-4" aria-hidden="true" />
              </div>
              <p className="mb-1 text-xs font-medium text-[var(--color-text)]">
                {dragActive ? "Drop your PDF here" : "Drag & drop a PDF"}
              </p>
              <p className="mb-3 text-[10px] text-[var(--color-text-muted)]">
                or browse from your device
              </p>
              <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                Browse files
              </Button>
              <p className="mt-2 text-[9px] text-[var(--color-text-subtle)]">
                Text-based PDFs only
              </p>
            </>
          ) : (
            <div className="text-left space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-slate-950/25 p-2.5">
                <FileTextIcon className="h-7 w-7 flex-shrink-0 text-emerald-300" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium text-[var(--color-text)]">{selectedFile.name}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">{formatFileSize(selectedFile.size)}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={handleRemoveFile} aria-label="Remove file">
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>

              {fileError && (
                <div className="flex items-center gap-2 text-sm text-[var(--color-error)]" role="alert">
                  <AlertCircleIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  <span>{fileError}</span>
                </div>
              )}

              {!fileError && !uploading && (
                <Button onClick={handleUpload} className="w-full" size="lg">
                  <UploadIcon className="h-4 w-4" />
                  Upload & Process
                </Button>
              )}

              {uploading && (
                <div className="flex items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]" role="status">
                  <LoaderIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Processing document…</span>
                </div>
              )}
            </div>
          )}

          {uploadError && (
            <div className="mt-4 flex items-center gap-2 text-sm text-[var(--color-error)]" role="alert">
              <AlertCircleIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 px-1 text-[9px] leading-4 text-[var(--color-text-subtle)]">
          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-emerald-300/70" />
          <p>Scanned or image-only PDFs are not supported.</p>
        </div>
      </CardContent>
    </Card>
  );
}