// The one module the screens load lazily to make a PDF. On web, Expo puts a
// module that two lazily loaded chunks share into the common chunk that
// every page downloads. With a lazy import per builder, pdf-lib (about
// 540 KB) was in two chunks and so in every page's download. Through this
// one module it is in one chunk, fetched when someone makes a PDF.
export { buildDesignRequestPdf, designRequestPdfFilename } from "./designRequestPdf";
export { buildEventRequestPdf, eventRequestPdfFilename } from "./eventRequestPdf";
