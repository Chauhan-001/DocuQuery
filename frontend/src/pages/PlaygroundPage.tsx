import { useState, useCallback } from "react";
import { useDocuments } from "../hooks/useDocuments";
import { useSelectedDocument } from "../hooks/useSelectedDocument";
import { api, type RetrievalChunk } from "../api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Textarea } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { CollapsiblePanel } from "../components/ui/Collapsible";
import { LoaderIcon, AlertCircleIcon, SettingsIcon, LinkIcon, ArrowRightIcon } from "../components/icons";
import { cn } from "../utils";

export function PlaygroundPage() {
  const { documents } = useDocuments();
  const { selectedDocumentId: documentId, setSelectedDocumentId } = useSelectedDocument();
  const selectedDocument = documents.find((document) => document.documentId === documentId);
  const [question, setQuestion] = useState("");
  const [topK, setTopK] = useState(3);
  const [scoreThreshold, setScoreThreshold] = useState(0.4);
  const [results, setResults] = useState<RetrievalChunk[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparisonResults, setComparisonResults] = useState<{ config: string; chunks: RetrievalChunk[] }[]>([]);

  const runSearch = async () => {
    if (question.trim().length < 3 || !documentId || selectedDocument?.status !== "ready" || running) return;

    setRunning(true);
    setError(null);
    setResults([]);
    setHasSearched(false);

    try {
      const chunks = await api.searchChunks(question.trim(), documentId, topK, scoreThreshold);
      setResults(chunks);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setRunning(false);
    }
  };

  const runComparison = async () => {
    if (question.trim().length < 3 || !documentId || selectedDocument?.status !== "ready" || running) return;

    setRunning(true);
    setError(null);
    setComparisonResults([]);
    setHasSearched(false);

    const configs = [
      { topK: 1, threshold: 0.5, label: "Top-1, Threshold 0.5" },
      { topK: 3, threshold: 0.4, label: "Top-3, Threshold 0.4 (default)" },
      { topK: 5, threshold: 0.3, label: "Top-5, Threshold 0.3" },
    ];

    try {
      const allResults = await Promise.all(
        configs.map(async (cfg) => {
          const chunks = await api.searchChunks(question.trim(), documentId, cfg.topK, cfg.threshold);
          return { config: cfg.label, chunks };
        })
      );
      setComparisonResults(allResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runSearch();
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)] flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-[var(--color-accent)]" />
          RAG Playground
        </h1>
        <p className="text-[var(--color-text-muted)] mt-1">
          Experiment with retrieval parameters. Adjust Top-K and similarity threshold to see how they affect results.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_2fr] gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5 text-[var(--color-accent)]" />
                Query Configuration
              </CardTitle>
              <CardDescription>
                Select a document and configure retrieval parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                  Document
                </label>
                <select
                  value={documentId ?? ""}
                  onChange={(e) => setSelectedDocumentId(e.target.value || null)}
                  disabled={running}
                  className="w-full px-3 py-2 text-sm bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)]"
                >
                  <option value="">Select a document...</option>
                  {documents.map((doc) => (
                    <option key={doc.documentId} value={doc.documentId}>
                      {doc.filename} ({doc.chunkCount} chunks)
                    </option>
                  ))}
                </select>
              </div>

              <Textarea
                value={question}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter a question to test retrieval..."
                rows={3}
                disabled={running}
                helperText="Press Enter to search, Shift+Enter for new line"
              />

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                    Top-K: {topK}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    disabled={running}
                    className="w-full h-2 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-accent)]"
                    aria-label="Top-K"
                  />
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    Number of chunks to retrieve (1-5)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                    Similarity Threshold: {scoreThreshold.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={scoreThreshold}
                    onChange={(e) => setScoreThreshold(Number(e.target.value))}
                    disabled={running}
                    className="w-full h-2 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-accent)]"
                    aria-label="Similarity threshold"
                  />
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    Minimum cosine similarity (0.0-1.0). Not a probability.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={runSearch} disabled={question.trim().length < 3 || selectedDocument?.status !== "ready" || running} className="flex-1" size="lg">
                  {running ? (
                    <>
                      <LoaderIcon className="h-4 w-4 animate-spin" />
                      Search
                    </>
                  ) : (
                    <>
                      <SettingsIcon className="h-4 w-4" />
                      Search
                    </>
                  )}
                </Button>
                <Button variant="secondary" onClick={runComparison} disabled={question.trim().length < 3 || selectedDocument?.status !== "ready" || running} className="flex-1">
                  <ArrowRightIcon className="h-4 w-4" />
                  Compare
                </Button>
              </div>

              {error && (
                <div className="p-3 bg-[var(--color-error-light)] border border-[var(--color-error-border)] rounded-lg text-sm text-[var(--color-error)]" role="alert">
                  <AlertCircleIcon className="h-4 w-4 inline-block mr-2" />
                  {error}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircleIcon className="h-5 w-5 text-[var(--color-warning)]" />
                Parameter Guidelines
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
                <h5 className="font-medium text-[var(--color-text)] mb-2">Top-K</h5>
                <ul className="text-[var(--color-text-muted)] space-y-1 list-disc list-inside">
                  <li><strong>Lower (1-2):</strong> More focused, faster, but may miss relevant context</li>
                  <li><strong>Higher (4-5):</strong> More context for LLM, but includes less relevant chunks</li>
                  <li><strong>Default (3):</strong> Good balance for most use cases</li>
                </ul>
              </div>
              <div className="p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
                <h5 className="font-medium text-[var(--color-text)] mb-2">Similarity Threshold</h5>
                <ul className="text-[var(--color-text-muted)] space-y-1 list-disc list-inside">
                  <li><strong>Higher (0.5-0.7):</strong> Stricter, fewer but more relevant results</li>
                  <li><strong>Lower (0.1-0.3):</strong> More permissive, may include noise</li>
                  <li><strong>Default (0.4):</strong> Reasonable filter for this embedding model</li>
                  <li>Scores are <strong>cosine similarity</strong>, not probabilities or confidence</li>
                </ul>
</div>
              </CardContent>
            </Card>
        </div>

        <div className="space-y-4">
          {comparisonResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowRightIcon className="h-5 w-5 text-[var(--color-accent)]" />
                  Configuration Comparison
                </CardTitle>
                <CardDescription>
                  Same question, different retrieval settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {comparisonResults.map(({ config, chunks }) => (
                    <CollapsiblePanel
                      key={config}
                      title={`${config} — ${chunks.length} chunks`}
                      defaultOpen={true}
                    >
                      <div className="space-y-2">
                        {chunks.length === 0 ? (
                          <p className="text-[var(--color-text-muted)] text-sm">No chunks retrieved</p>
                        ) : (
                          chunks.map((chunk, i) => (
                            <div key={`${chunk.source}-${chunk.chunk_index}`} className="p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <Badge variant="info">{config}</Badge>
                                <Badge variant="default">#{i + 1}</Badge>
                                <Badge variant="info">Score: {chunk.score.toFixed(4)}</Badge>
                                <Badge variant="default">{chunk.source} • Chunk {chunk.chunk_index}</Badge>
                              </div>
                              <p className="text-sm text-[var(--color-text)] line-clamp-3">{chunk.text}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </CollapsiblePanel>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {hasSearched && results.length === 0 && comparisonResults.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircleIcon className="mx-auto h-8 w-8 text-[var(--color-warning)] mb-3" />
                <h3 className="font-medium text-[var(--color-text)]">No matching chunks</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  The search completed successfully but found no chunks above this threshold.
                </p>
              </CardContent>
            </Card>
          )}

          {results.length > 0 && comparisonResults.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5 text-[var(--color-accent)]" />
                  Retrieved Chunks ({results.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {results.map((chunk, index) => (
                    <CollapsiblePanel
                      key={`${chunk.source}-${chunk.chunk_index}`}
                      title={`#${index + 1} ${chunk.source} — Chunk ${chunk.chunk_index} (Score: ${chunk.score.toFixed(4)})`}
                      defaultOpen={index < 3}
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant="info">Similarity: {chunk.score.toFixed(4)}</Badge>
                          <Badge variant="default">Length: {chunk.chunk_length ?? chunk.text.length} chars</Badge>
                          <Badge variant="default">Top-K: {topK}</Badge>
                          <Badge variant="default">Threshold: {scoreThreshold.toFixed(1)}</Badge>
                        </div>
                        <pre className="p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text)] overflow-auto whitespace-pre-wrap max-h-64">
                          {chunk.text}
                        </pre>
                      </div>
                    </CollapsiblePanel>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {!running && !hasSearched && !error && results.length === 0 && comparisonResults.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <SettingsIcon className="mx-auto h-12 w-12 text-[var(--color-text-subtle)] mb-4" />
                <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">No results yet</h3>
                <p className="text-[var(--color-text-muted)]">
                  Select a document, enter a question, and click Search to see retrieved chunks.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}