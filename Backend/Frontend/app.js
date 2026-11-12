// ==========================================
// 1. Lógica global y control del Modal
// ==========================================
let map = null; // Variable global para la instancia de Leaflet
let origenActual = '';
let destinoActual = '';

document.addEventListener("DOMContentLoaded", () => {
    const ventanaModal = document.getElementById('mapModal');
    const botonCerrar = document.getElementById('closeModal');
    const btnBuscar = document.getElementById('btnBuscar');

    if (ventanaModal && botonCerrar) {
        botonCerrar.addEventListener('click', () => {
            ventanaModal.style.display = 'none';
        });

        window.addEventListener('click', (event) => {
            if (event.target === ventanaModal) {
                ventanaModal.style.display = 'none';
            }
        });
    } else {
        console.error("¡ALERTA DOM!: No se encontraron 'mapModal' o 'closeModal' en el HTML.");
    }

    // ==========================================
    // 2. Lógica del Botón Buscar
    // ==========================================
    if (btnBuscar) {
        btnBuscar.addEventListener('click', async () => {
            const guia = document.getElementById('inputGuia').value.trim();
            const resultadoDiv = document.getElementById('resultado');

            if (!guia) {
                resultadoDiv.innerHTML = '<p style="color: red;">Por favor ingresa un número de guía válido.</p>';
                return;
            }

            resultadoDiv.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Buscando paquete...</p></div>';

            try {
                const respuesta = await fetch(`http://localhost:3000/api/rastreo/${guia}`);
                
                if (respuesta.ok) {
                    const data = await respuesta.json();
                    const fecha = new Date(data.fecha_hora).toLocaleString('es-CO');
                    
                    origenActual = data.direccion_origen;
                    destinoActual = data.direccion_destino;
                    
                    resultadoDiv.innerHTML = `
                        <div>
                            <h3 style="color: #ff6600; margin-bottom: 15px;">📦 Guía: ${data.numero_guia}</h3>
                            <p style="margin-bottom: 8px;"><strong>Estado Actual:</strong> ${data.estado}</p>
                            <p style="margin-bottom: 8px;"><strong>Última Ubicación:</strong> ${data.ubicacion_actual}</p>
                            <p style="margin-bottom: 8px;"><strong>Fecha de actualización:</strong> ${fecha}</p>
                            <hr style="margin: 15px 0; border: 0; border-top: 1px solid #eee;">
                            <p style="margin-bottom: 8px;"><strong>Origen:</strong> ${data.direccion_origen}</p>
                            <p style="margin-bottom: 15px;"><strong>Destino:</strong> ${data.direccion_destino}</p>
                            
                            <button id="btnVerMapa" class="btn-mapa">
                                <i class="fa-solid fa-map-location-dot"></i> Ver ruta en el mapa
                            </button>
                        </div>
                    `;

                    document.getElementById('btnVerMapa').addEventListener('click', () => {
                        ventanaModal.style.display = 'flex'; // Mostramos el modal
                        
                        trazarRuta(origenActual, destinoActual);
                        
                        // CORRECCIÓN LEAFLET: Forzar actualización de tamaño tras abrir el modal
                        setTimeout(() => {
                            if (map !== null) {
                                map.invalidateSize();
                            }
                        }, 200);
                    });

                } else {
                    const errorData = await respuesta.json();
                    resultadoDiv.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p style="color: red;">${errorData.mensaje}</p></div>`;
                }
            } catch (error) {
                console.error("Error:", error);
                resultadoDiv.innerHTML = '<div class="empty-state"><i class="fa-solid fa-server"></i><p style="color: red;">Error al conectar con el servidor.</p></div>';
            }
        });
    }
});

// ==========================================
// 3. Función de OpenStreetMap (Leaflet)
// ==========================================
async function trazarRuta(origen, destino) {
    if (map !== null) {
        map.remove();
        map = null;
    }

    map = L.map('map').setView([4.60971, -74.08175], 13);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    try {
        const coordsOrigen = await obtenerCoordenadas(origen);
        const coordsDestino = await obtenerCoordenadas(destino);

        if (coordsOrigen && coordsDestino) {
            L.marker([coordsOrigen.lat, coordsOrigen.lon]).addTo(map).bindPopup(`<b>Origen:</b> ${origen}`).openPopup();
            L.marker([coordsDestino.lat, coordsDestino.lon]).addTo(map).bindPopup(`<b>Destino:</b> ${destino}`);

            const bounds = L.latLngBounds([
                [coordsOrigen.lat, coordsOrigen.lon],
                [coordsDestino.lat, coordsDestino.lon]
            ]);
            map.fitBounds(bounds, { padding: [50, 50] });
        } else {
            console.error("No se pudieron encontrar las coordenadas de las direcciones.");
        }
    } catch (error) {
        console.error("Error al trazar la ruta en OpenStreetMap:", error);
    }
}

// Función auxiliar para buscar coordenadas con Nominatim
async function obtenerCoordenadas(direccion) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion)}`;
    const respuesta = await fetch(url);
    const datos = await respuesta.json();
    
    if (datos && datos.length > 0) {
        return {
            lat: parseFloat(datos[0].lat),
            lon: parseFloat(datos[0].lon)
        };
    }
    return null;
}