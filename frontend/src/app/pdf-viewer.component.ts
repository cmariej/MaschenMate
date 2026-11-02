import { ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

interface PageState {
  element: HTMLElement;
  canvas: HTMLCanvasElement | null;
  rendering: RenderTask | null;
  visible: boolean;
  generation: number;
}

@Component({
  selector: 'app-pdf-viewer',
  template: `
    <section class="pdf-reader" aria-label="PDF-Anleitung">
      <div class="pdf-toolbar">
        <span>{{ pageCount ? pageCount + (pageCount === 1 ? ' Seite' : ' Seiten') : 'PDF-Anleitung' }}</span>
        <div class="pdf-zoom" aria-label="Ansichtsgröße">
          <button type="button" (click)="changeZoom(-0.25)" [disabled]="zoom <= 1" aria-label="Verkleinern">−</button>
          <span>{{ zoom * 100 }}%</span>
          <button type="button" (click)="changeZoom(0.25)" [disabled]="zoom >= 2" aria-label="Vergrößern">+</button>
        </div>
      </div>
      @if (loading) { <p class="pdf-status" role="status">PDF wird angezeigt …</p> }
      @if (error) { <p class="pdf-status pdf-error" role="alert">{{ error }}</p> }
      <div class="pdf-scroll" tabindex="0" aria-label="Alle Seiten der PDF-Anleitung">
        <div #pages class="pdf-pages" [style.width.%]="zoom * 100"></div>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .pdf-reader { border: 1px solid #e9dce4; border-radius: 10px; overflow: hidden; background: #f6f0f4; }
    .pdf-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; color: #624c5e; font-size: 13px; font-weight: 600; }
    .pdf-zoom { display: flex; align-items: center; gap: 10px; }
    .pdf-zoom button { width: 36px; height: 36px; border: 1px solid #e5d7e0; border-radius: 8px; background: #fff; color: #765d70; font-size: 20px; cursor: pointer; }
    .pdf-zoom button:disabled { opacity: .4; cursor: default; }
    .pdf-zoom span { min-width: 38px; text-align: center; }
    .pdf-scroll { width: 100%; max-height: min(78vh, 900px); overflow: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
    .pdf-pages { box-sizing: border-box; display: grid; gap: 12px; padding: 10px; min-width: 100%; }
    .pdf-status { margin: 0; padding: 12px; color: #756773; font-size: 13px; }
    .pdf-error { color: #a3443c; }
  `],
})
export class PdfViewerComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) pdf!: Blob;
  @ViewChild('pages', { static: true }) private pages!: ElementRef<HTMLElement>;
  protected loading = false;
  protected error = '';
  protected pageCount = 0;
  protected zoom = 1;
  private readonly changeDetector = inject(ChangeDetectorRef);
  private document: PDFDocumentProxy | null = null;
  private loadingTask: PDFDocumentLoadingTask | null = null;
  private observer: IntersectionObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastWidth = 0;
  private pageStates: PageState[] = [];
  private generation = 0;
  private initialized = false;

  ngOnInit(): void { this.initialized = true; void this.load(); }
  ngOnChanges(): void { if (this.initialized) void this.load(); }
  ngOnDestroy(): void { this.cleanup(); }

  protected changeZoom(delta: number): void {
    this.zoom = Math.max(1, Math.min(2, this.zoom + delta));
    for (const state of this.pageStates) this.releasePage(state);
    requestAnimationFrame(() => { for (const state of this.pageStates) if (state.visible) void this.renderPage(state); });
  }

  private async load(): Promise<void> {
    this.cleanup();
    const generation = this.generation;
    this.error = '';
    this.pageCount = 0;
    this.loading = true;
    this.changeDetector.markForCheck();
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const assetBase = new URL('assets/pdfjs/', document.baseURI).href;
      pdfjs.GlobalWorkerOptions.workerSrc = `${assetBase}pdf.worker.min.mjs`;
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error());
        reader.onerror = reader.onabort = () => reject(new Error());
        reader.readAsArrayBuffer(this.pdf);
      });
      if (generation !== this.generation) return;
      this.loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), cMapUrl: `${assetBase}cmaps/`, cMapPacked: true, iccUrl: `${assetBase}iccs/`, standardFontDataUrl: `${assetBase}standard_fonts/`, wasmUrl: `${assetBase}wasm/` });
      const pdf = await this.loadingTask.promise;
      if (generation !== this.generation) return;
      this.document = pdf;
      this.pageCount = pdf.numPages;
      this.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const state = this.pageStates.find((item) => item.element === entry.target);
          if (!state) continue;
          state.visible = entry.isIntersecting;
          if (state.visible) void this.renderPage(state);
          else this.releasePage(state);
        }
      }, { rootMargin: '600px' });
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver((entries) => {
          const width = Math.round(entries[0]?.contentRect.width ?? 0);
          if (!width || width === this.lastWidth) return;
          this.lastWidth = width;
          for (const state of this.pageStates) this.releasePage(state);
          requestAnimationFrame(() => { for (const state of this.pageStates) if (state.visible) void this.renderPage(state); });
        });
        this.resizeObserver.observe(this.pages.nativeElement);
      }
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        if (generation !== this.generation) return;
        const viewport = page.getViewport({ scale: 1 });
        const element = document.createElement('div');
        element.style.cssText = `position:relative;width:100%;aspect-ratio:${viewport.width}/${viewport.height};background:#fff;box-shadow:0 2px 8px #0002;`;
        element.setAttribute('aria-label', `Seite ${pageNumber} von ${pdf.numPages}`);
        element.setAttribute('aria-busy', 'true');
        element.dataset['pageNumber'] = String(pageNumber);
        this.pages.nativeElement.appendChild(element);
        const state: PageState = { element, canvas: null, rendering: null, visible: false, generation: 0 };
        this.pageStates.push(state);
        this.observer.observe(element);
      }
      this.loading = false;
      this.changeDetector.markForCheck();
    } catch {
      if (generation !== this.generation) return;
      this.loading = false;
      this.error = 'Die PDF konnte nicht angezeigt werden. Bitte öffne sie über „In neuem Tab öffnen“. Auf dem iPhone ist das auch über die Teilen-Funktion möglich.';
      this.changeDetector.markForCheck();
    }
  }

  private async renderPage(state: PageState): Promise<void> {
    if (!this.document || state.canvas || state.rendering) return;
    const generation = ++state.generation;
    try {
      const page = await this.document.getPage(Number(state.element.dataset['pageNumber']));
      if (!state.visible || generation !== state.generation) return;
      const naturalWidth = page.getViewport({ scale: 1 }).width;
      const cssWidth = state.element.clientWidth;
      if (!cssWidth) return;
      const viewport = page.getViewport({ scale: cssWidth / naturalWidth });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4_000_000 / (viewport.width * viewport.height)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      canvas.style.cssText = 'display:block;width:100%;height:auto;';
      state.canvas = canvas;
      state.element.appendChild(canvas);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas nicht verfügbar');
      state.rendering = page.render({ canvas, canvasContext: context, viewport, transform: [outputScale, 0, 0, outputScale, 0, 0] });
      await state.rendering.promise;
      if (generation === state.generation) {
        state.rendering = null;
        state.element.dataset['rendered'] = 'true';
        state.element.setAttribute('aria-busy', 'false');
      }
    } catch {
      if (generation === state.generation && state.visible) {
        this.releasePage(state);
        this.error = 'Eine PDF-Seite konnte nicht dargestellt werden. Bitte öffne die PDF in einem neuen Tab.';
        this.changeDetector.markForCheck();
      }
    }
  }

  private releasePage(state: PageState): void {
    state.generation++;
    state.rendering?.cancel();
    state.rendering = null;
    delete state.element.dataset['rendered'];
    state.element.setAttribute('aria-busy', 'true');
    if (state.canvas) { state.canvas.remove(); state.canvas.width = 0; state.canvas.height = 0; state.canvas = null; }
  }

  private cleanup(): void {
    this.generation++;
    this.observer?.disconnect();
    this.observer = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.lastWidth = 0;
    for (const state of this.pageStates) this.releasePage(state);
    this.pageStates = [];
    this.pages?.nativeElement.replaceChildren();
    void this.loadingTask?.destroy().catch(() => undefined);
    this.loadingTask = null;
    this.document = null;
  }
}
