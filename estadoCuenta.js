// estadoCuenta.js

// Se asume que jspdf y jspdf-autotable están cargados globalmente desde el HTML.
const { jsPDF } = window.jspdf;

export default class EstadoCuentaManager {
    constructor(appInstance) {
        this.app = appInstance;
        this.keyMiembroSeleccionado = null;
        this.miembroSeleccionadoData = {};
        this.historialActual = [];
        this.sortOrder = 'asc';
        this.pdfDoc = null;

        this.ui = {
            content: document.getElementById('estadoCuentaContent'),
            summary: document.getElementById('resumen_financiero'),
            startDate: document.getElementById('fecha_inicio_estado'),
            endDate: document.getElementById('fecha_fin_estado'),
            generateBtn: document.querySelector('#seccion_estado_cuenta .btn-primary'),
            memberName: document.getElementById('nombre_miembro_grande'),
            memberEmail: document.getElementById('miembro_email'),
            pdfViewer: document.getElementById('visorPDF'),
            sendPdfBtn: document.querySelector('#modalPDF .btn-primary')
        };

        this.attachEventListeners();
    }

    attachEventListeners() {
        this.ui.generateBtn.addEventListener('click', () => this.cargarHistorialYRenderizar());
        this.ui.sendPdfBtn.addEventListener('click', () => this.enviarPDFPorCorreo());
        
        this.ui.content.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button) return;

            const action = button.dataset.action;
            if (action === 'sort') this.ordenarHistorial();
            if (action === 'generate-pdf') this.generarPDF();
            if (action === 'delete-tx') this.eliminarTransaccion(button.dataset.key, button.dataset.id);
            if (action === 'void-receipt') this.anularRecibo(button.dataset.key, button.dataset.num);
            if (action === 'view-receipt-pdf') this.verPDFRecibo(button.dataset.num);
        });
    }

    init(keyMiembro, miembroData) {
        this.keyMiembroSeleccionado = keyMiembro;
        this.miembroSeleccionadoData = miembroData;
        this.sortOrder = 'asc';
        
        this.ui.memberName.textContent = this.miembroSeleccionadoData['Nombre Completo']?.toUpperCase() || 'N/A';
        this.ui.memberEmail.textContent = this.miembroSeleccionadoData.Email || 'N/A';

        if (this.keyMiembroSeleccionado) {
            this.cargarHistorialYRenderizar();
        }
    }

    cargarHistorialYRenderizar() {
        if (!this.keyMiembroSeleccionado) return;
        this.ui.content.innerHTML = '<p>Cargando historial...</p>';
        this.ui.summary.innerHTML = '';
        
        const fechaInicio = this.ui.startDate.value;
        const fechaFin = this.ui.endDate.value;
        let apiUrl = `/api/historial/listar_historial?key_miembro=${this.keyMiembroSeleccionado}`;
        if (fechaInicio) apiUrl += `&fecha_inicio=${fechaInicio}`;
        if (fechaFin) apiUrl += `&fecha_fin=${fechaFin}`;

        fetch(apiUrl)
            .then(res => res.json())
            .then(data => {
                this.historialActual = data.respuesta || [];
                this.renderizarTabla();
            }).catch(error => {
                console.error("Error al cargar historial:", error);
                this.ui.content.innerHTML = '<p style="color:red;">Error al cargar el historial.</p>';
            });
    }

    ordenarHistorial() {
        this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        this.renderizarTabla();
    }

    renderizarTabla() {
        const historialOrdenado = [...this.historialActual].sort((a, b) => {
            const fechaA = new Date(a.Fecha);
            const fechaB = new Date(b.Fecha);
            return this.sortOrder === 'asc' ? fechaA - fechaB : fechaB - fechaA;
        });

        let saldoAcumulado = 0, totalDeudas = 0, totalPagos = 0;
        let tablaHTML = `<table class="main-table tabla-estado-cuenta"><thead><tr><th>Recibo</th><th>Fecha <button class="sort-btn" data-action="sort">↕️</button></th><th>Tipo</th><th>Concepto/Detalle</th><th style="text-align:right;">Monto</th><th style="text-align:right;">Saldo</th><th style="text-align:center;">Acción</th></tr></thead><tbody>`;

        historialOrdenado.forEach(tx => {
            const monto = parseFloat(tx.Monto) || 0;
            let montoDisplay = tx.Tipo === 'Deuda' ? monto : -monto;
            if (tx.Tipo === 'Deuda') totalDeudas += monto; else totalPagos += monto;
            saldoAcumulado += montoDisplay;
            
            const fechaFormateada = tx.Fecha ? new Date(tx.Fecha + 'T05:00:00').toLocaleDateString('es-PA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';
            let accionHTML = '-';
            if (tx.Tipo === 'Deuda' && tx.historial_id) {
                accionHTML = `<button class="btn btn-danger btn-sm" data-action="delete-tx" data-key="${this.keyMiembroSeleccionado}" data-id="${tx.historial_id}">Eliminar</button>`;
            } else if (tx.Tipo === 'Pago' && !tx.Anulado) {
                accionHTML = `<div style="display:flex; flex-direction:column; gap:5px;">
                    <button class="btn btn-secondary btn-sm" data-action="void-receipt" data-key="${this.keyMiembroSeleccionado}" data-num="${tx.NumeroRecibo}">Anular</button>
                    <button class="btn btn-primary btn-sm" data-action="view-receipt-pdf" data-num="${tx.NumeroRecibo}">Ver PDF</button>
                </div>`;
            }

            const detalle = tx.Detalle || tx.Descripcion || tx.Concepto || '';
            
            tablaHTML += `<tr><td>${tx.NumeroRecibo || 'N/A'}</td><td>${fechaFormateada}</td><td>${tx.Tipo}</td><td>${detalle}</td><td style="text-align:right;">${montoDisplay.toFixed(2)}</td><td style="text-align:right; font-weight: 600;">${saldoAcumulado.toFixed(2)}</td><td style="text-align:center;">${accionHTML}</td></tr>`;
        });
        
        tablaHTML += `</tbody></table><div style="text-align:center; margin-top:20px;"><button class="btn btn-primary" data-action="generate-pdf">Generar PDF</button></div>`;
        this.ui.content.innerHTML = tablaHTML;

        const saldoFinal = totalDeudas - totalPagos;
        
        this.ui.summary.innerHTML = `
            <div class="summary-item"><strong>Total Pagos/Créditos</strong><span class="negative">-$${totalPagos.toFixed(2)}</span></div>
            <div class="summary-item"><strong>Saldo Final</strong><span class="${saldoFinal >= 0 ? 'positive' : 'negative'}">$${saldoFinal.toFixed(2)}</span></div>
        `;
    }
    
    eliminarTransaccion(key, id) {
        if (!confirm('¿Seguro?')) return;
        fetch('/eliminar_transaccion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key_miembro: key, historial_id: id }) })
            .then(res => res.json())
            .then(d => {
                alert(d.message || d.error);
                this.init(this.keyMiembroSeleccionado, this.miembroSeleccionadoData);
            });
    }
    
    anularRecibo(key, num) {
        const motivo = prompt('Motivo de anulación:');
        if (!motivo) return;
        fetch('/anular_recibo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key_miembro: key, numero_recibo: num, motivo_cancelacion: motivo }) })
            .then(res => res.json())
            .then(d => {
                alert(d.message || d.error);
                this.init(this.keyMiembroSeleccionado, this.miembroSeleccionadoData);
            });
    }

    verPDFRecibo(numeroRecibo) {
        window.open(`/static/pdf/recibo_${numeroRecibo}.pdf`, '_blank');
    }

    generarPDF() {
        if (this.historialActual.length === 0) { alert("No hay transacciones para generar un PDF."); return; }
        this.pdfDoc = new jsPDF('p', 'mm', 'letter');
        
        const nombreMiembro = this.ui.memberName.textContent || 'N/A';
        const fechaInicio = this.ui.startDate.value || 'N/A';
        const fechaFin = this.ui.endDate.value || 'N/A';
        const totalPagos = this.ui.summary.querySelector('.negative').textContent;
        const saldoFinal = this.ui.summary.querySelectorAll('span')[1].textContent;
        
        try { 
            this.pdfDoc.addImage('templates/pdf/plantilla2.png', 'PNG', 0, 0, this.pdfDoc.internal.pageSize.getWidth(), this.pdfDoc.internal.pageSize.getHeight()); 
        } catch(e) { 
            console.warn("No se pudo cargar la imagen de plantilla para el PDF."); 
        }
        
        const resumenConfig = {
            fontSize: 10,
            startX: 35,
            startY: 115,
            lineSpacing: 5
        };

        let posY = resumenConfig.startY;

        this.pdfDoc.setFontSize(12); 
        this.pdfDoc.text(`Estado de Cuenta para: ${nombreMiembro}`, resumenConfig.startX, posY);
        posY += resumenConfig.lineSpacing * 2;

        this.pdfDoc.setFontSize(10); 
        this.pdfDoc.text(`Periodo: ${fechaInicio} a ${fechaFin}`, resumenConfig.startX, posY);
        posY += resumenConfig.lineSpacing * 1.5;

        this.pdfDoc.text(`Resumen:`, resumenConfig.startX, posY);
        posY += resumenConfig.lineSpacing;
        this.pdfDoc.text(`- Total Pagos: ${totalPagos}`, resumenConfig.startX + 2, posY);
        posY += resumenConfig.lineSpacing;
        this.pdfDoc.text(`- Saldo Final: ${saldoFinal}`, resumenConfig.startX + 2, posY);
        
        const historialOrdenadoParaPDF = [...this.historialActual].sort((a, b) => {
            const fechaA = new Date(a.Fecha);
            const fechaB = new Date(b.Fecha);
            return this.sortOrder === 'asc' ? fechaA - fechaB : fechaB - fechaA;
        });

        const tableData = historialOrdenadoParaPDF.map(tx => {
            const monto = parseFloat(tx.Monto) || 0; 
            const montoDisplay = tx.Tipo === 'Deuda' ? monto : -monto;
            
            // ==== INICIO DE CORRECCIÓN PARA TEXTO LARGO ====
            // Ancho de la columna 'Detalle' en mm (85mm como se definió en columnStyles)
            const detalleColumnWidth = 85; 
            // Usamos la propia función de jsPDF para dividir el texto en líneas que quepan en el ancho definido.
            const detalleCompleto = tx.Detalle || '';
            const detalleLines = this.pdfDoc.splitTextToSize(detalleCompleto, detalleColumnWidth);
            // ==== FIN DE CORRECCIÓN ====

            return [ 
                tx.NumeroRecibo || 'N/A', 
                tx.Fecha ? new Date(tx.Fecha + 'T05:00:00').toLocaleDateString('es-PA') : 'N/A', 
                tx.Tipo, 
                detalleLines, // Pasamos el array de líneas en lugar de un string largo
                montoDisplay.toFixed(2) 
            ];
        });
        
        this.pdfDoc.autoTable({
            head: [['Recibo', 'Fecha', 'Tipo', 'Detalle', 'Monto']], 
            body: tableData, 
            startY: posY + 10,
            theme: 'grid', 
            headStyles: { fillColor: [7, 107, 140] },
            styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
            margin: { left: 30, right: 30 },
            columnStyles: {
                0: { cellWidth: 15 }, 
                1: { cellWidth: 20 }, 
                2: { cellWidth: 15 }, 
                3: { cellWidth: 85 }, // Ancho fijo para forzar el ajuste
                4: { cellWidth: 20, halign: 'right' }
            }
        });
        
        this.ui.pdfViewer.src = this.pdfDoc.output('bloburl');
        this.app.abrirModal('modalPDF');
    }

    enviarPDFPorCorreo() {
        if (!this.pdfDoc) { alert("Primero debes generar un PDF."); return; }
        const emailDestino = this.ui.memberEmail.textContent.trim();
        if (!emailDestino || emailDestino === 'N/A') { alert("El miembro no tiene un correo electrónico registrado."); return; }
        
        const base64PDF = this.pdfDoc.output('datauristring').split(',')[1];
        fetch("/enviar_estado_cuenta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pdf: base64PDF, email: emailDestino }) })
            .then(res => res.json())
            .then(data => alert(data.message || data.error))
            .catch(err => alert("Error de conexión al enviar correo: " + err));
    }
}
