import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { SaleData } from "@/types/sales";

// Card dimensions in mm
const CARD_W = 190;
const CARD_H = 80;
const MARGIN = 10;
const LEFT_W = 50;
const RIGHT_W = 45;
const CENTER_W = CARD_W - LEFT_W - RIGHT_W;

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function generateBarcodeDataUrl(value: string): string | null {
  if (!value) return null;
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, value, {
      format: "CODE128",
      width: 1.5,
      height: 40,
      displayValue: true,
      fontSize: 10,
      margin: 2,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

async function generateQRCodeDataUrl(value: string): Promise<string | null> {
  if (!value) return null;
  try {
    return await QRCode.toDataURL(value, { width: 120, margin: 1 });
  } catch {
    return null;
  }
}

function drawPlaceholder(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setFillColor(230, 230, 235);
  doc.roundedRect(x, y, w, h, 3, 3, "F");
  doc.setFontSize(8);
  doc.setTextColor(160, 160, 170);
  doc.text("Sem imagem", x + w / 2, y + h / 2 + 2, { align: "center" });
}

async function drawSaleCard(doc: jsPDF, sale: SaleData, offsetY: number) {
  const x0 = MARGIN;
  const y0 = offsetY;

  // Card border
  doc.setDrawColor(200, 200, 210);
  doc.setLineWidth(0.3);
  doc.roundedRect(x0, y0, CARD_W, CARD_H, 3, 3, "S");

  // --- LEFT BLOCK: product image ---
  const imgX = x0 + 5;
  const imgY = y0 + 8;
  const imgSize = LEFT_W - 10;

  const imgData = sale.productImageUrl
    ? await loadImageAsDataUrl(sale.productImageUrl)
    : null;

  if (imgData) {
    // Border frame
    doc.setDrawColor(180, 180, 195);
    doc.setLineWidth(0.5);
    doc.roundedRect(imgX - 1, imgY - 1, imgSize + 2, imgSize + 2, 2, 2, "S");
    try {
      doc.addImage(imgData, "JPEG", imgX, imgY, imgSize, imgSize);
    } catch {
      drawPlaceholder(doc, imgX, imgY, imgSize, imgSize);
    }
  } else {
    drawPlaceholder(doc, imgX, imgY, imgSize, imgSize);
  }

  // --- CENTER BLOCK ---
  const cx = x0 + LEFT_W;
  let cy = y0 + 8;

  // SKU badge
  doc.setFillColor(235, 240, 255);
  doc.roundedRect(cx, cy, 30, 6, 1, 1, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60, 80, 180);
  doc.text(sale.sku || "—", cx + 15, cy + 4.2, { align: "center" });

  // Qty next to SKU
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 130);
  doc.text(`Qtd: ${sale.quantity}`, cx + 33, cy + 4.2);

  cy += 9;

  // Product name
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 40);
  const productLines = doc.splitTextToSize(sale.productName || "—", CENTER_W - 5);
  doc.text(productLines.slice(0, 2), cx, cy);
  cy += productLines.slice(0, 2).length * 4 + 3;

  // Info grid
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 100);

  const infoItems = [
    [`# ${sale.saleNumber || "—"}`, `📅 ${sale.saleDate || "—"} ${sale.saleTime || ""}`],
    [`👤 ${sale.customerName || "—"}`, `🏷 ${sale.customerNickname || "—"}`],
  ];

  for (const row of infoItems) {
    doc.text(row[0], cx, cy);
    doc.text(row[1], cx + CENTER_W / 2, cy);
    cy += 5;
  }

  // Amount
  if (sale.amount) {
    cy += 2;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 150, 80);
    doc.text(`R$ ${sale.amount.toFixed(2)}`, cx, cy);
  }

  // --- RIGHT BLOCK: barcode + QR ---
  const rx = x0 + LEFT_W + CENTER_W + 2;
  let ry = y0 + 5;

  // Separator line
  doc.setDrawColor(220, 220, 230);
  doc.setLineWidth(0.2);
  doc.line(rx - 3, y0 + 5, rx - 3, y0 + CARD_H - 5);

  // Barcode
  const barcodeData = generateBarcodeDataUrl(sale.barcodeValue);
  if (barcodeData) {
    try {
      doc.addImage(barcodeData, "PNG", rx, ry, RIGHT_W - 8, 20);
    } catch {
      // skip
    }
  } else {
    doc.setFontSize(6);
    doc.setTextColor(170, 170, 180);
    doc.text("Sem código de barras", rx + (RIGHT_W - 8) / 2, ry + 10, { align: "center" });
  }

  ry += 24;

  // QR Code
  const qrData = await generateQRCodeDataUrl(sale.qrcodeValue);
  if (qrData) {
    const qrSize = 28;
    const qrX = rx + (RIGHT_W - 8 - qrSize) / 2;
    try {
      doc.addImage(qrData, "PNG", qrX, ry, qrSize, qrSize);
    } catch {
      // skip
    }
  } else {
    doc.setFontSize(6);
    doc.setTextColor(170, 170, 180);
    doc.text("Sem QR Code", rx + (RIGHT_W - 8) / 2, ry + 14, { align: "center" });
  }
}

function getFileName(sale: SaleData): string {
  const id = sale.saleNumber || sale.sku || sale.saleDate || "etiqueta";
  return `etiqueta-${id}.pdf`;
}

export async function exportSalePdf(sale: SaleData): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [CARD_H + MARGIN * 2, CARD_W + MARGIN * 2] });
  await drawSaleCard(doc, sale, MARGIN);
  doc.save(getFileName(sale));
}

export async function exportBatchPdf(sales: SaleData[]): Promise<void> {
  const cardsPerPage = 3;
  const pageH = MARGIN + cardsPerPage * (CARD_H + 5) + MARGIN;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [pageH, CARD_W + MARGIN * 2] });

  for (let i = 0; i < sales.length; i++) {
    const pageIndex = Math.floor(i / cardsPerPage);
    const posInPage = i % cardsPerPage;

    if (pageIndex > 0 && posInPage === 0) {
      doc.addPage([pageH, CARD_W + MARGIN * 2], "landscape");
    }

    const offsetY = MARGIN + posInPage * (CARD_H + 5);
    await drawSaleCard(doc, sales[i], offsetY);
  }

  const name = sales.length === 1 ? getFileName(sales[0]) : `etiquetas-lote-${sales.length}.pdf`;
  doc.save(name);
}
