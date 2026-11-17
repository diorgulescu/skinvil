// SPDX-License-Identifier: GPL-3.0-only
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { isTauriDesktop } from '../core/wardrobeClient';

export interface DragDropCallbacks {
  /** Called with HTML5 File objects dropped onto the window (browser/web fallback). */
  onHtmlFilesDrop: (files: File[]) => void;
  /** Called with OS file paths dropped via Tauri v2 native drag-and-drop. */
  onTauriPathsDrop: (paths: string[]) => void;
}

/**
 * Full-window drag-and-drop overlay handling both HTML5 file drops and
 * Tauri v2 native OS path drops. Extracted from appShell to keep that file focused.
 */
export class DragDropZone {
  public readonly overlayEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private dragDepth = 0;

  constructor(
    mountEl: HTMLElement,
    private readonly cb: DragDropCallbacks
  ) {
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'drop-overlay hidden';

    const card = document.createElement('div');
    card.className = 'drop-overlay-card';
    this.titleEl = document.createElement('h2');
    this.subEl = document.createElement('p');
    card.append(this.titleEl, this.subEl);
    this.overlayEl.appendChild(card);
    mountEl.appendChild(this.overlayEl);

    this.bindHtml5Events(mountEl);
    this.bindTauriNativeEvents();
  }

  public setLabels(title: string, sub: string): void {
    this.titleEl.textContent = title;
    this.subEl.textContent = sub;
  }

  private show(): void {
    this.overlayEl.classList.remove('hidden');
  }

  private hide(): void {
    this.overlayEl.classList.add('hidden');
  }

  private bindHtml5Events(mountEl: HTMLElement): void {
    mountEl.addEventListener('dragenter', (e) => {
      e.preventDefault();
      this.dragDepth++;
      this.show();
    });

    mountEl.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    mountEl.addEventListener('dragleave', () => {
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (this.dragDepth === 0) {
        this.hide();
      }
    });

    mountEl.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dragDepth = 0;
      this.hide();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) {
        this.cb.onHtmlFilesDrop(files);
      }
    });
  }

  private bindTauriNativeEvents(): void {
    if (!isTauriDesktop()) return;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'enter' || event.payload.type === 'over') {
          this.show();
        } else if (event.payload.type === 'leave') {
          this.hide();
        } else if (event.payload.type === 'drop') {
          this.hide();
          const pngPaths = event.payload.paths.filter((p) =>
            p.toLowerCase().endsWith('.png')
          );
          if (pngPaths.length > 0) {
            this.cb.onTauriPathsDrop(pngPaths);
          }
        }
      })
      .catch(() => {
        // Ignore if running outside native webview window
      });
  }
}
