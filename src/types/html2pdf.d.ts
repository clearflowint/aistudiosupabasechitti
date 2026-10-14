declare module "html2pdf.js" {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: Record<string, unknown>;
    pagebreak?: { mode?: string[] };
  }
  interface Html2PdfWorker {
    set(options: Html2PdfOptions): Html2PdfWorker;
    from(source: HTMLElement): Html2PdfWorker;
    save(): Promise<void>;
  }
  export default function html2pdf(): Html2PdfWorker;
}
