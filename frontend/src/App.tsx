import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { ResearchPage } from "./pages/ResearchPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { ExplorerPage } from "./pages/ExplorerPage";
import { PlaygroundPage } from "./pages/PlaygroundPage";
import { ResearchStatusProvider } from "./context/ResearchStatusContext";

function App() {
  return (
    <ResearchStatusProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<ResearchPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/explorer" element={<ExplorerPage />} />
            <Route path="/playground" element={<PlaygroundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ResearchStatusProvider>
  );
}

export default App;