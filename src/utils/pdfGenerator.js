/**
 * PDF generator for pending content ideas.
 * Generates a clean table PDF and returns it as a Buffer.
 */

const PDFDocument = require('pdfkit');

/**
 * @param {Array}  ideas      - Array of idea rows from DB
 * @param {string} modelName  - Model's name (used in title)
 * @returns {Promise<Buffer>}
 */
function generatePendingIdeasPdf(ideas, modelName) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // ── Header ──────────────────────────────────────────────────────────────
    doc
      .fillColor('#1a1a2e')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('Clark Bot — Ideas Pendientes', { align: 'center' });

    doc
      .moveDown(0.3)
      .fontSize(12)
      .font('Helvetica')
      .fillColor('#555')
      .text(`Modelo: ${modelName}`, { align: 'center' })
      .text(`Generado: ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}`, { align: 'center' });

    doc.moveDown(1);

    // ── Table setup ─────────────────────────────────────────────────────────
    const startX    = 40;
    const pageWidth = doc.page.width - 80; // usable width

    const colW = {
      num:   30,
      type:  60,
      link:  220,
      notes: pageWidth - 30 - 60 - 220 - 3 * 8, // remaining
    };

    const rowH   = 14;
    const padX   = 4;
    const padY   = 3;
    const headerH = rowH + padY * 2;

    // ── Table header ─────────────────────────────────────────────────────────
    function drawHeader(y) {
      doc.fillColor('#1a1a2e').rect(startX, y, pageWidth, headerH).fill();

      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);

      let x = startX + padX;
      doc.text('#',     x, y + padY, { width: colW.num,   lineBreak: false }); x += colW.num + 8;
      doc.text('Tipo',  x, y + padY, { width: colW.type,  lineBreak: false }); x += colW.type + 8;
      doc.text('Link',  x, y + padY, { width: colW.link,  lineBreak: false }); x += colW.link + 8;
      doc.text('Notas', x, y + padY, { width: colW.notes, lineBreak: false });

      return y + headerH;
    }

    let currentY = drawHeader(doc.y);

    // ── Rows ──────────────────────────────────────────────────────────────────
    ideas.forEach((idea, i) => {
      const isEven    = i % 2 === 0;
      const bgColor   = isEven ? '#f8f9fa' : '#ffffff';
      const typeLabel = idea.type === 'reddit' ? 'Reddit' : 'Reels';
      const notesTxt  = idea.notes || '—';
      const linkTxt   = idea.link || '—';
      const date      = new Date(idea.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

      // Estimate row height based on notes length
      const notesLines = Math.ceil(notesTxt.length / 45) + 1;
      const thisRowH   = Math.max(rowH + padY * 2, notesLines * 11 + padY * 2);

      // Page break if needed
      if (currentY + thisRowH > doc.page.height - 60) {
        doc.addPage();
        currentY = drawHeader(40);
      }

      // Row background
      doc.fillColor(bgColor).rect(startX, currentY, pageWidth, thisRowH).fill();

      // Row border (bottom line)
      doc.strokeColor('#dee2e6').lineWidth(0.5)
        .moveTo(startX, currentY + thisRowH)
        .lineTo(startX + pageWidth, currentY + thisRowH)
        .stroke();

      // Row content
      doc.fillColor('#333').font('Helvetica').fontSize(8);

      let x = startX + padX;
      doc.text(String(i + 1), x, currentY + padY, { width: colW.num,   lineBreak: false }); x += colW.num + 8;
      doc.text(typeLabel,     x, currentY + padY, { width: colW.type,  lineBreak: false }); x += colW.type + 8;

      // Link — truncated if too long
      const linkDisplay = linkTxt.length > 45 ? linkTxt.slice(0, 42) + '…' : linkTxt;
      doc.fillColor('#0066cc').text(linkDisplay, x, currentY + padY, { width: colW.link, lineBreak: false }); x += colW.link + 8;

      // Fecha under link (small)
      doc.fillColor('#888').fontSize(7).text(date, startX + padX + colW.num + 8 + colW.type + 8, currentY + padY + 10, { width: colW.link, lineBreak: false });

      // Notes
      doc.fillColor('#333').fontSize(8).text(notesTxt, x, currentY + padY, { width: colW.notes, lineBreak: true });

      currentY += thisRowH;
    });

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.moveDown(1.5)
      .fontSize(8)
      .fillColor('#aaa')
      .font('Helvetica')
      .text(`Total pendientes: ${ideas.length}`, { align: 'right' });

    doc.end();
  });
}

module.exports = { generatePendingIdeasPdf };
