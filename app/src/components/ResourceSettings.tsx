import { FolderPlus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { desktop, isDesktop } from "../lib/desktop";
import { send, useMyAgent } from "../lib/store";

export function ResourceSettings() {
  const grants = useMyAgent((s) => s.resourceGrants);
  const connected = useMyAgent((s) => s.connected);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (connected) send("resources.list");
  }, [connected]);

  async function addFolder() {
    setNotice("");
    setBusy(true);
    try {
      const path = await desktop.selectFolder();
      if (path) send("resources.grant", { path, read: true, write: false });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The folder picker could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  function change(path: string, permission: "read" | "write", value: boolean) {
    send("resources.update", { path, [permission]: value });
  }

  return (
    <section className="resource-settings" aria-label="Local folder access">
      <div className="resource-heading">
        <div>
          <h3 className="sub">Local folder access</h3>
          <p className="resource-description">
            Choose exactly which folders MyAgent may use. New folders are read-only.
          </p>
        </div>
        <ShieldCheck size={22} aria-hidden />
      </div>

      {!isDesktop() && (
        <p className="resource-notice">
          Folder selection is available in the Windows desktop app, not the browser-only version.
        </p>
      )}

      <button className="btn-secondary btn-sm resource-add" onClick={addFolder} disabled={!isDesktop() || !connected || busy}>
        <FolderPlus size={17} />
        {busy ? "Opening folder picker…" : "Choose a folder"}
      </button>

      {grants.length === 0 ? (
        <p className="resource-empty">No folders are shared with MyAgent yet.</p>
      ) : (
        <ul className="resource-list">
          {grants.map((grant) => (
            <li className="resource-item" key={grant.path}>
              <code className="resource-path" title={grant.path}>{grant.path}</code>
              <div className="resource-permissions">
                <label>
                  <input type="checkbox" checked={grant.read} onChange={(e) => change(grant.path, "read", e.target.checked)} />
                  Read
                </label>
                <label>
                  <input type="checkbox" checked={grant.write} onChange={(e) => change(grant.path, "write", e.target.checked)} />
                  Write
                </label>
                <button
                  className="resource-revoke"
                  type="button"
                  title="Revoke this folder"
                  aria-label={`Revoke access to ${grant.path}`}
                  onClick={() => send("resources.revoke", { path: grant.path })}
                >
                  <Trash2 size={16} />
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="resource-footnote">
        Folder access is limited to the paths above. MyAgent does not scan subfolders automatically.
        Writes and deletions always ask for your approval. Credential files and secret folders are blocked.
      </p>
      {notice && <p className="resource-notice" role="alert">{notice}</p>}
      <button className="chip resource-refresh" type="button" onClick={() => send("resources.list")} disabled={!connected}>
        <RefreshCw size={14} /> Refresh permissions
      </button>
    </section>
  );
}
