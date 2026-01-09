import React, { useState, useEffect } from 'react';

export default function GeocodingTool({ data, onUpdateData, onBack }) {
  const [queue, setQueue] = useState([]);
  const [processed, setProcessed] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [current, setCurrent] = useState(null);
  const [progress, setProgress] = useState(0);

  // Al caricamento, identifichiamo chi non ha coordinate VERE (non stimate)
  useEffect(() => {
    // Consideriamo "da fare" quelli che non hanno lat/lng o hanno lat/lng vuoti
    const todo = data.filter(r => !r.lat || !r.lng || r.lat === "" || r.regione === "N.D.");
    const done = data.filter(r => r.lat && r.lng && r.lat !== "");
    setQueue(todo);
    setProcessed(done);
  }, []);

  // Il Motore che gira
  useEffect(() => {
    let timer;
    if (isRunning && queue.length > 0) {
      const item = queue[0];
      setCurrent(item);

      timer = setTimeout(async () => {
        try {
          // Costruiamo la query per Nominatim
          const address = `${item.indirizzo}, ${item.citta}, ${item.provincia}`;
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&addressdetails=1&limit=1`;
          
          const response = await fetch(url, {
             headers: { 'User-Agent': 'MappaRistorantiApp/1.0' } // Importante per non essere bloccati
          });
          const results = await response.json();

          let updatedItem = { ...item };

          if (results && results.length > 0) {
            updatedItem.lat = results[0].lat;
            updatedItem.lng = results[0].lon;
            // Bonus: Se Nominatim ci dà la regione corretta, la salviamo!
            if (results[0].address && results[0].address.state) {
                updatedItem.regione = results[0].address.state;
            }
          }

          // Sposta dalla coda ai processati
          setProcessed(prev => [...prev, updatedItem]);
          setQueue(prev => prev.slice(1));
          
          // Aggiorna la barra progresso
          const total = queue.length + processed.length;
          setProgress(Math.floor(((processed.length + 1) / total) * 100));

        } catch (error) {
          console.error("Errore fetch", error);
          // In caso di errore lo spostiamo comunque per non bloccare tutto
          setProcessed(prev => [...prev, item]);
          setQueue(prev => prev.slice(1));
        }
      }, 1500); // 1.5 secondi di pausa (REGOLA D'ORO)
    } else if (queue.length === 0 && isRunning) {
      setIsRunning(false);
      alert("Finito! Ora scarica il JSON aggiornato.");
    }

    return () => clearTimeout(timer);
  }, [isRunning, queue, processed]);

  // Funzione per scaricare il file finale
  const downloadJSON = () => {
    const jsonString = JSON.stringify([...processed, ...queue], null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = "ristoranti_reali_completo.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '20px', background: 'white', height: '100%', overflowY: 'auto' }}>
      <button onClick={onBack} style={{ marginBottom: '20px' }}>⬅ Torna alla Mappa</button>
      
      <h2>🔧 Strumento Geocoding Automatico</h2>
      <p>Questo strumento contatta OpenStreetMap per ogni ristorante mancante.</p>
      <div style={{ background: '#fff3cd', padding: '10px', borderRadius: '5px', marginBottom: '20px', fontSize: '14px' }}>
        ⚠️ <strong>Attenzione:</strong> Non chiudere questa finestra mentre lavora. Ci vorrà tempo (1.5 secondi per ristorante).
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {!isRunning && queue.length > 0 && (
            <button onClick={() => setIsRunning(true)} style={{ padding: '10px 20px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                ▶ Avvia Ricerca ({queue.length} rimanenti)
            </button>
        )}
        {isRunning && (
            <button onClick={() => setIsRunning(false)} style={{ padding: '10px 20px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                ⏸ Metti in Pausa
            </button>
        )}
        <button onClick={downloadJSON} style={{ padding: '10px 20px', background: '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
            💾 Scarica JSON Aggiornato
        </button>
      </div>

      {/* Progress Bar */}
      <div style={{ height: '20px', width: '100%', background: '#eee', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: '#2ecc71', transition: 'width 0.5s' }}></div>
      </div>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>{progress}% Completato</div>

      {/* Log Console */}
      <div style={{ border: '1px solid #ddd', padding: '10px', height: '300px', overflowY: 'auto', background: '#f9f9f9', fontFamily: 'monospace' }}>
        {current && isRunning && (
            <div style={{ color: '#e67e22', fontWeight: 'bold' }}>
                ⏳ Elaborazione: {current.nomeRistorante} ({current.citta})...
            </div>
        )}
        {processed.slice(-10).reverse().map((r, i) => (
            <div key={i} style={{ borderBottom: '1px solid #eee', padding: '5px 0' }}>
                {r.lat ? '✅' : '❌'} {r.nomeRistorante}: {r.lat ? `Trovato (${r.lat}, ${r.lng})` : 'Indirizzo non trovato'}
            </div>
        ))}
      </div>
    </div>
  );
}