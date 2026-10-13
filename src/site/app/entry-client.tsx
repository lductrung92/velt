import { hydrateRoot } from "react-dom/client";
import { App } from "./App";
import type { AppProps } from "./types";
import "./styles/styles.css";
import "./styles/catalog.css";
import "./styles/profile.css";
import "./styles/team.css";
import "./styles/chat.css";
import "./styles/blog.css";

const props: AppProps = JSON.parse(
  document.getElementById("site-data")!.textContent!,
);
hydrateRoot(document.getElementById("root")!, <App {...props} />);
