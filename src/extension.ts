import * as vscode from 'vscode';
import { invalidate } from './cache';
import { resolveIcon, type Config } from './resolve';
import { toDataUri } from './svg';

const MAX_DOC_CHARS = 1_000_000;

function readConfig(): { enabled: boolean; languages: string[]; config: Config } {
  const c = vscode.workspace.getConfiguration('iconpeek');
  const obj = <T>(key: string, fallback: T): T => {
    const v = c.get<T>(key);
    return v && typeof v === 'object' ? v : fallback;
  };
  return {
    enabled: c.get<boolean>('enabled', true),
    languages: c.get<string[]>('languages', []),
    config: {
      previewSize: Math.min(256, Math.max(16, c.get<number>('previewSize', 48))),
      iconComponentPatterns: obj('iconComponentPatterns', { Icon: ['name', 'icon'] }),
      nameToFolder: obj('nameToFolder', {}),
      maxSvgBytes: Math.max(1024, c.get<number>('maxSvgBytes', 200_000)),
    },
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const { languages } = readConfig();
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(languages.map((language) => ({ language, scheme: 'file' })), {
      provideHover(doc, pos) {
        const { enabled, config } = readConfig();
        if (!enabled || doc.getText().length > MAX_DOC_CHARS) return undefined;
        const hit = resolveIcon({
          text: doc.getText(),
          offset: doc.offsetAt(pos),
          file: doc.uri.fsPath,
          roots: (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
          config,
        });
        if (!hit) return undefined;
        // A data: image needs neither isTrusted nor supportHtml (VS Code's markdown sanitizer allows data: media).
        // Size and chip are baked into the svg itself, so plain markdown is enough.
        const md = new vscode.MarkdownString(`![icon](${toDataUri(hit.svg)})\n\n`);
        md.appendText(`${hit.name} · ${hit.source}`);
        return new vscode.Hover(md, new vscode.Range(doc.positionAt(hit.range[0]), doc.positionAt(hit.range[1])));
      },
    }),
  );

  // Cache entries are also validated by mtime on every hit; the watcher just frees them eagerly.
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.svg');
  const drop = (u: vscode.Uri) => invalidate(u.fsPath);
  context.subscriptions.push(watcher, watcher.onDidChange(drop), watcher.onDidCreate(drop), watcher.onDidDelete(drop));
}

export function deactivate(): void {}
