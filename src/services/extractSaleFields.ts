import { SaleData } from "@/types/sales";

interface ExtractionResult {
  sale: SaleData;
  rawText: string;
  confidence: Record<string, "high" | "medium" | "low" | "empty">;
}

const MONTH_MAP: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04",
  mai: "05", jun: "06", jul: "07", ago: "08",
  set: "09", out: "10", nov: "11", dez: "12",
};

/**
 * Split raw text into individual sale blocks using "ML #" as primary delimiter.
 */
export function splitSaleBlocks(rawText: string): string[] {
  const parts = rawText.split(/(?=ML\s*#)/i);
  const blocks = parts.filter((b) => b.trim().length > 20);
  if (blocks.length > 1) return blocks;

  // Fallback: split by "Imprimir etiqueta"
  const parts2 = rawText.split(/(?=Imprimir\s+etiqueta)/i);
  const blocks2 = parts2.filter((b) => b.trim().length > 20);
  if (blocks2.length > 1) return blocks2;

  return [rawText];
}

/**
 * Extract the product line: the first meaningful line AFTER "Imprimir etiqueta".
 * Falls back to any line matching the product+price pattern.
 */
function extractProductLine(block: string): string | null {
  // Strategy 1: find text after "Imprimir etiqueta"
  const imprimirIdx = block.search(/Imprimir\s+etiqueta/i);
  if (imprimirIdx !== -1) {
    const afterImprimir = block.slice(imprimirIdx);
    // Skip the "Imprimir etiqueta" line itself, then grab the next meaningful content
    const afterLabel = afterImprimir.replace(/^Imprimir\s+etiqueta\s*/i, "");
    // Look for a line containing R$ (the product line)
    const lineMatch = afterLabel.match(/^([^\n\r]*R\$[^\n\r]*)/m);
    if (lineMatch) return lineMatch[1].trim();
    // Or just take the first non-empty line
    const firstLine = afterLabel.match(/^([^\n\r]{10,})/m);
    if (firstLine) return firstLine[1].trim();
  }

  // Strategy 2: find any line with the product pattern anywhere in block
  const productPattern = block.match(/^(.{5,}?)\s+R\$\s*[\d.,]+\s*\d+\s*unidades?/im);
  if (productPattern) return productPattern[0].trim();

  return null;
}

/**
 * Extract customer name and nickname from the zone between
 * "Não afeta sua reputação" and "Iniciar conversa".
 * Handles concatenated formats like "Luiz FelypheFELYPHELUI…"
 */
function extractCustomer(block: string): { name: string; nickname: string; confidence: "high" | "medium" | "low" | "empty" } {
  // Try to isolate the buyer zone
  let buyerZone = "";

  const reputacaoMatch = block.match(/(?:N[ãa]o\s+afeta\s+sua\s+reputa[çc][ãa]o|reputação)\s*(.*?)(?:Iniciar\s+conversa)/is);
  if (reputacaoMatch) {
    buyerZone = reputacaoMatch[1].trim();
  } else {
    // Fallback: look for the name+nickname pattern followed by "Iniciar conversa"
    const fallback = block.match(/([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+){0,4}[A-Z][A-Z0-9._…]{2,})\s*(?:Iniciar\s+conversa)/);
    if (fallback) buyerZone = fallback[1].trim();
  }

  if (!buyerZone) {
    return { name: "", nickname: "", confidence: "empty" };
  }

  // The buyer zone may look like:
  // "Luiz FelypheFELYPHELUI…"
  // "FRANCISCO JE… JEORGEVALI…"
  // "Fabricio Matos N…FABRICIOMA…"
  // Strategy: find where the uppercase/alphanumeric nickname starts
  // The nickname is a sequence of uppercase letters/digits (possibly with dots/underscores) ending with optional "…"

  // Try to match: human name part + nickname part
  const nameNickMatch = buyerZone.match(
    /^((?:[A-ZÀ-Ú][a-zà-ú]+\s*)+?)([A-Z][A-Z0-9._]{2,}[…]?)$/
  );
  if (nameNickMatch) {
    return {
      name: nameNickMatch[1].trim(),
      nickname: nameNickMatch[2].replace(/…$/, "").trim(),
      confidence: "high",
    };
  }

  // Handle all-caps names like "FRANCISCO JE… JEORGEVALI…"
  const allCapsMatch = buyerZone.match(
    /^([A-ZÀ-Ú][A-ZÀ-Ú\s.…]+?)\s+([A-Z][A-Z0-9._]{2,}[…]?)$/
  );
  if (allCapsMatch) {
    return {
      name: allCapsMatch[1].replace(/…/g, "").trim(),
      nickname: allCapsMatch[2].replace(/…$/, "").trim(),
      confidence: "medium",
    };
  }

  // Last resort: treat entire zone as name
  return {
    name: buyerZone.replace(/…/g, "").trim(),
    nickname: "",
    confidence: "low",
  };
}

/**
 * Extract sale fields from a single block of text (one sale).
 */
export function extractSaleFields(rawText: string): ExtractionResult {
  const confidence: Record<string, "high" | "medium" | "low" | "empty"> = {};

  // === SALE NUMBER ===
  const saleNumMatch = rawText.match(/ML\s*#\s*(\d{10,20})/i);
  const saleNumber = saleNumMatch ? saleNumMatch[1] : "";
  confidence["saleNumber"] = saleNumber ? "high" : "empty";

  // === DATE + TIME ===
  let saleDate = "";
  let saleTime = "";

  const mlDateMatch = rawText.match(
    /(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:\s+(\d{4}))?\s+(\d{1,2}:\d{2})\s*(?:hs?)?/i
  );
  if (mlDateMatch) {
    const day = mlDateMatch[1].padStart(2, "0");
    const monthNum = MONTH_MAP[mlDateMatch[2].toLowerCase()];
    let year = mlDateMatch[3] || "";
    if (!year) {
      const now = new Date();
      const candidate = new Date(now.getFullYear(), parseInt(monthNum, 10) - 1, parseInt(day, 10));
      year = candidate > now ? (now.getFullYear() - 1).toString() : now.getFullYear().toString();
    }
    saleDate = `${year}-${monthNum}-${day}`;
    saleTime = mlDateMatch[4];
    confidence["saleDate"] = mlDateMatch[3] ? "high" : "medium";
    confidence["saleTime"] = "high";
  } else {
    const dateMatch = rawText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dateMatch) {
      saleDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      confidence["saleDate"] = "high";
    } else {
      const isoMatch = rawText.match(/(\d{4}-\d{2}-\d{2})/);
      saleDate = isoMatch ? isoMatch[1] : "";
      confidence["saleDate"] = isoMatch ? "high" : "empty";
    }
    const timeMatch = rawText.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:h|hs)?/i);
    saleTime = timeMatch ? timeMatch[1] : "";
    confidence["saleTime"] = saleTime ? "high" : "empty";
  }

  // === CUSTOMER NAME + NICKNAME ===
  const customer = extractCustomer(rawText);
  const customerName = customer.name;
  const customerNickname = customer.nickname;
  confidence["customerName"] = customer.confidence;
  confidence["customerNickname"] = customer.nickname ? customer.confidence : "empty";

  // === PRODUCT (from line after "Imprimir etiqueta") ===
  let productName = "";
  let amount: number | undefined;
  let sku = "";
  let quantity = 1;

  const productLine = extractProductLine(rawText);

  if (productLine) {
    // Full pattern: "Name R$ 26 1 unidade SKU: EC007"
    const fullMatch = productLine.match(
      /^(.+?)\s+R\$\s*([\d.,]+)\s*(\d+)\s*unidades?\s+SKU:\s*([A-Z0-9_-]+)/i
    );
    if (fullMatch) {
      productName = fullMatch[1].trim();
      amount = parseFloat(fullMatch[2].replace(/\./g, "").replace(",", "."));
      quantity = parseInt(fullMatch[3], 10) || 1;
      sku = fullMatch[4];
      confidence["productName"] = "high";
      confidence["amount"] = "high";
      confidence["quantity"] = "high";
      confidence["sku"] = "high";
    } else {
      // Without SKU: "Name R$ 26 1 unidade"
      const noSkuMatch = productLine.match(
        /^(.+?)\s+R\$\s*([\d.,]+)\s*(\d+)\s*unidades?/i
      );
      if (noSkuMatch) {
        productName = noSkuMatch[1].trim();
        amount = parseFloat(noSkuMatch[2].replace(/\./g, "").replace(",", "."));
        quantity = parseInt(noSkuMatch[3], 10) || 1;
        confidence["productName"] = "high";
        confidence["amount"] = "high";
        confidence["quantity"] = "high";
      } else {
        // Just name before R$
        const nameOnly = productLine.match(/^(.+?)\s+R\$/i);
        if (nameOnly) {
          productName = nameOnly[1].trim();
          confidence["productName"] = "medium";
        } else {
          productName = productLine.slice(0, 120);
          confidence["productName"] = "low";
        }

        const amtMatch = productLine.match(/R\$\s*([\d.,]+)/);
        if (amtMatch) {
          amount = parseFloat(amtMatch[1].replace(/\./g, "").replace(",", "."));
          confidence["amount"] = "high";
        }

        const qtyMatch = productLine.match(/(\d+)\s*unidades?/i);
        quantity = qtyMatch ? parseInt(qtyMatch[1], 10) || 1 : 1;
      }

      // Try standalone SKU
      const skuMatch = productLine.match(/SKU:\s*([A-Z0-9_-]+)/i) || rawText.match(/SKU:\s*([A-Z0-9_-]+)/i);
      sku = skuMatch ? skuMatch[1] : "";
      confidence["sku"] = sku ? "high" : "empty";
    }
  } else {
    // No product line found — try global fallbacks
    const globalProduct = rawText.match(/(.{5,}?)\s+R\$\s*([\d.,]+)/i);
    if (globalProduct) {
      // Ensure we're not grabbing the header line
      const candidate = globalProduct[1].trim();
      if (!/ML\s*#/i.test(candidate) && !/\d{1,2}\s+(jan|fev|mar|abr|mai)/i.test(candidate)) {
        productName = candidate;
        amount = parseFloat(globalProduct[2].replace(/\./g, "").replace(",", "."));
        confidence["productName"] = "low";
        confidence["amount"] = "medium";
      }
    }
    confidence["productName"] = confidence["productName"] || "empty";
    confidence["amount"] = confidence["amount"] || "empty";

    const skuMatch = rawText.match(/SKU:\s*([A-Z0-9_-]+)/i);
    sku = skuMatch ? skuMatch[1] : "";
    confidence["sku"] = sku ? "high" : "empty";
  }

  confidence["quantity"] = confidence["quantity"] || (quantity > 1 ? "high" : "low");

  // Barcode and QR code derived from SKU (optional — never critical error)
  const barcodeValue = sku;
  const qrcodeValue = sku;
  confidence["barcodeValue"] = sku ? "high" : "low";
  confidence["qrcodeValue"] = sku ? "high" : "low";

  const sale: SaleData = {
    id: crypto.randomUUID(),
    saleNumber,
    saleDate,
    saleTime,
    customerName,
    customerNickname,
    productName,
    sku,
    quantity,
    amount,
    barcodeValue,
    qrcodeValue,
    productImageUrl: "",
  };

  return { sale, rawText, confidence };
}

/**
 * Extract multiple sales from raw text (handles multi-sale PDFs)
 */
export function extractMultipleSales(rawText: string): ExtractionResult[] {
  const blocks = splitSaleBlocks(rawText);
  return blocks.map((block) => extractSaleFields(block));
}
