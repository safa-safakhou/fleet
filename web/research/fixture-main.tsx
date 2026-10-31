import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { researchRoute } from "./route.js";
import { ResearchWorkspace } from "./workspace.js";

function Fixture() {
  const [route, setRoute] = useState(researchRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(researchRoute(location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return (
    <ResearchWorkspace
      key={route?.kind === "run" ? route.runId : "home"}
      runId={route?.kind === "run" ? route.runId : undefined}
    />
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
