import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./fonts.ts";
import "./index.css";
import "./i18n";

createRoot(document.getElementById("root")!).render(<App />);
