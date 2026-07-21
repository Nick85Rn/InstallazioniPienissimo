import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import Papa from 'papaparse';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { supabase, LOCALI_TABLE } from './supabaseClient';
import GeocodingTool from './GeocodingTool'; 
import L from 'leaflet';

// Ordine "logico" con cui mostrare gli stati cliente nei filtri
// (gli stati non presenti in questa lista vengono comunque mostrati, in coda)
const STATO_CLIENTE_ORDER = [
  'ATTIVO', 'GESTITO', 'PARZIALMENTE ATTIVO', 'NUOVO',
  'SOSPESO', 'DEMO', 'NON ATTIVO', 'DISDETTO'
];

// --- CONFIGURAZIONE COLORI E ICONE ---
const getMarkerColor = (contratto) => {
  const c = (contratto || "").toLowerCase();
  if (c.includes("platinum")) return "#9b59b6"; // Viola
  if (c.includes("gold")) return "#f1c40f";     // Oro
  if (c.includes("premium")) return "#2ecc71";  // Verde
  if (c.includes("start")) return "#3498db";    // Blu
  return "#95a5a6";                             // Grigio
};

const createCustomIcon = (contratto) => {
  const color = getMarkerColor(contratto);
  return L.divIcon({
    className: "custom-pin",
    html: `<div style="
      background-color: ${color};
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 0 4px rgba(0,0,0,0.5);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10]
  });
};

const PROVINCE_TO_REGION = {
    "AG": "Sicilia", "AL": "Piemonte", "AN": "Marche", "AO": "Valle d'Aosta", "AQ": "Abruzzo", "AR": "Toscana", "AP": "Marche", "AT": "Piemonte", "AV": "Campania", 
    "BA": "Puglia", "BT": "Puglia", "BL": "Veneto", "BN": "Campania", "BG": "Lombardia", "BI": "Piemonte", "BO": "Emilia-Romagna", "BZ": "Trentino-Alto Adige", "BS": "Lombardia", "BR": "Puglia", 
    "CA": "Sardegna", "CL": "Sicilia", "CB": "Molise", "CI": "Sardegna", "CE": "Campania", "CT": "Sicilia", "CZ": "Calabria", "CH": "Abruzzo", "CO": "Lombardia", "CS": "Calabria", "CR": "Lombardia", "KR": "Calabria", "CN": "Piemonte", 
    "EN": "Sicilia", "FM": "Marche", "FE": "Emilia-Romagna", "FI": "Toscana", "FG": "Puglia", "FC": "Emilia-Romagna", "FR": "Lazio", 
    "GE": "Liguria", "GO": "Friuli-Venezia Giulia", "GR": "Toscana", 
    "IM": "Liguria", "IS": "Molise", "SP": "Liguria", "LT": "Lazio", "LE": "Puglia", "LC": "Lombardia", "LI": "Toscana", "LO": "Lombardia", "LU": "Toscana", 
    "MC": "Marche", "MN": "Lombardia", "MS": "Toscana", "MT": "Basilicata", "VS": "Sardegna", "ME": "Sicilia", "MI": "Lombardia", "MO": "Emilia-Romagna", "MB": "Lombardia", 
    "NA": "Campania", "NO": "Piemonte", "NU": "Sardegna", "OG": "Sardegna", "OT": "Sardegna", "OR": "Sardegna", 
    "PD": "Veneto", "PA": "Sicilia", "PR": "Emilia-Romagna", "PV": "Lombardia", "PG": "Umbria", "PU": "Marche", "PE": "Abruzzo", "PC": "Emilia-Romagna", "PI": "Toscana", "PT": "Toscana", "PN": "Friuli-Venezia Giulia", "PZ": "Basilicata", "PO": "Toscana", 
    "RG": "Sicilia", "RA": "Emilia-Romagna", "RC": "Calabria", "RE": "Emilia-Romagna", "RI": "Lazio", "RN": "Emilia-Romagna", "RM": "Lazio", "RO": "Veneto", 
    "SA": "Campania", "SS": "Sardegna", "SV": "Liguria", "SI": "Toscana", "SR": "Sicilia", "SO": "Lombardia", 
    "TA": "Puglia", "TE": "Abruzzo", "TR": "Umbria", "TO": "Piemonte", "TP": "Sicilia", "TN": "Trentino-Alto Adige", "TV": "Veneto", "TS": "Friuli-Venezia Giulia", 
    "UD": "Friuli-Venezia Giulia", 
    "VA": "Lombardia", "VE": "Veneto", "VB": "Piemonte", "VC": "Piemonte", "VR": "Veneto", "VV": "Calabria", "VI": "Veneto", "VT": "Lazio", "SU": "Sardegna"
};

const cleanProvincia = (raw) => {
  if (!raw) return "?";
  return raw.replace(/[^a-zA-Z]/g, "").toUpperCase(); 
};

// --- COMPONENTE MAPPA ---
function MapUpdater({ center, bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] }); 
    } else if (center) {
      map.setView(center, 16, { animate: true });
    }
  }, [center, bounds, map]);
  return null;
}

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("dashboard"); 
  const [mapCenter, setMapCenter] = useState(null);
  const [mapBounds, setMapBounds] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // --- STATO RESPONSIVE ---
  // Sotto i 768px, sidebar e mappa non stanno più fianco a fianco (non c'è spazio):
  // si alternano a schermo intero, con un pulsante per passare dall'una all'altra.
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [mobileView, setMobileView] = useState('panel'); // 'panel' | 'map'

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // --- STATO PER EDITING ---
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  // --- STATO FILTRI ---
  // statoCliente: array di Stato_Cliente selezionati. Vuoto = nessun filtro (mostra tutti).
  const [filters, setFilters] = useState({
    regione: "",
    provincia: "",
    contratto: "",
    statoCliente: []
  });

      });
    }
  };

  // --- UPLOAD JSON ---
  const handleJsonUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsedData = JSON.parse(event.target.result);
        if (Array.isArray(parsedData)) {
            // Non serve rinormalizzare se il JSON è già stato pulito e ha ID, 
            // ma per sicurezza rigeneriamo gli ID se mancano o sono duplicati
            // (oppure ci fidiamo del JSON salvato).
            // Per sicurezza, se il JSON viene da noi, lo usiamo diretto.
            setData(parsedData);
            fitMapToData(parsedData);
            alert(`✅ Database ripristinato! Caricati ${parsedData.length} ristoranti.`);
        } else {
            alert("❌ Il file JSON non sembra corretto (deve essere una lista).");
        }
      } catch (error) {
        console.error(error);
        alert("❌ Errore nella lettura del file JSON.");
      }
    };
    reader.readAsText(file);
  };

  // --- FILTRAGGIO ---
  const filteredData = useMemo(() => {
    return data.filter(r => {
        const s = search.toLowerCase();
        const matchSearch = 
            r.nomeRistorante?.toLowerCase().includes(s) || 
            r.citta?.toLowerCase().includes(s) ||
            r.indirizzo?.toLowerCase().includes(s);

        const matchReg = filters.regione === "" || r.regione === filters.regione;
        const matchProv = filters.provincia === "" || r.provincia === filters.provincia;
        const matchCont = filters.contratto === "" || r.tipoContratto === filters.contratto;
        // Nessuno stato selezionato = nessun filtro (mostra tutti gli stati)
        const matchStato = filters.statoCliente.length === 0 || filters.statoCliente.includes(r.statoCliente);

        return matchSearch && matchReg && matchProv && matchCont && matchStato;
    });
  }, [data, search, filters]);

  const options = useMemo(() => {
    const regions = [...new Set(data.map(r => r.regione))].sort();
    const availableProvs = filters.regione 
        ? [...new Set(data.filter(r => r.regione === filters.regione).map(r => r.provincia))].sort()
        : [...new Set(data.map(r => r.provincia))].sort();
    const contracts = [...new Set(data.map(r => r.tipoContratto))].sort();

    // Stati cliente presenti nei dati, ordinati secondo STATO_CLIENTE_ORDER
    // (quelli non previsti in quella lista finiscono in coda, in ordine alfabetico)
    const statesPresent = [...new Set(data.map(r => r.statoCliente).filter(Boolean))];
    const statiCliente = statesPresent.sort((a, b) => {
        const ia = STATO_CLIENTE_ORDER.indexOf(a);
        const ib = STATO_CLIENTE_ORDER.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    return { regions, provinces: availableProvs, contracts, statiCliente };
  }, [data, filters.regione]);

  const stats = useMemo(() => {
    const subset = filteredData;
    const regionCount = {};
    const provCount = {};
    const contractCount = {};
    
    subset.forEach(r => {
      regionCount[r.regione] = (regionCount[r.regione] || 0) + 1;
      provCount[r.provincia] = (provCount[r.provincia] || 0) + 1;
      contractCount[r.tipoContratto] = (contractCount[r.tipoContratto] || 0) + 1;
    });

    return { 
      total: subset.length, 
      mapped: subset.filter(r => r.lat && r.lng).length,
      topRegions: Object.entries(regionCount).sort((a,b) => b[1] - a[1]),
      topProv: Object.entries(provCount).sort((a,b) => b[1] - a[1]),
      byContract: Object.entries(contractCount).sort((a,b) => b[1] - a[1])
    };
  }, [filteredData]);

  const fitMapToData = (dataset) => {
    const coords = dataset
      .filter(r => r.lat && r.lng)
      .map(r => [parseFloat(r.lat), parseFloat(r.lng)]);
    if (coords.length > 0) {
      setMapBounds(coords); 
      setMapCenter(null);   
    }
  };

  useEffect(() => {
      if (filteredData.length > 0) fitMapToData(filteredData);
  }, [filters, data]);

  const handleRowClick = (r) => {
    if (editingId === r.id) return;

    setSelectedId(r.id); 
    if (r.lat && r.lng) {
      setMapBounds(null); 
      setMapCenter([parseFloat(r.lat), parseFloat(r.lng)]); 
      if (isMobile) setMobileView('map'); 
    } 
  };

  const toggleStatoCliente = (stato) => {
    setFilters(prev => {
      const already = prev.statoCliente.includes(stato);
      const statoCliente = already
        ? prev.statoCliente.filter(s => s !== stato)
        : [...prev.statoCliente, stato];
      return { ...prev, statoCliente };
    });
  };

  const openGoogleMaps = (e, r) => {
    e.stopPropagation(); 
    const query = encodeURIComponent(`${r.indirizzo}, ${r.citta}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  // Chiamato dal GeocodingTool per ogni record geocodificato con successo:
  // aggiorna lo stato locale e, se il record viene da Supabase, salva subito
  // lat/lng nel database (indirizzo_fonte resta quello originale, non 'manuale').
  const handleGeocodedItem = async (item) => {
    setData(prev => prev.map(r => (r.id === item.id ? { ...r, ...item } : r)));

    if (item.zohoLocaleId && item.lat && item.lng) {
      try {
        const { error } = await supabase
          .from(LOCALI_TABLE)
          .update({ lat: parseFloat(item.lat), lng: parseFloat(item.lng) })
          .eq('zoho_locale_id', item.zohoLocaleId);
        if (error) throw error;
      } catch (err) {
        console.error('Errore salvataggio coordinate su Supabase:', err);
      }
    }
  };

  if (view === 'tool') {
    return <GeocodingTool data={data} onUpdateItem={handleGeocodedItem} onBack={() => setView('dashboard')} />;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', fontFamily: 'Segoe UI, sans-serif', color: '#2c3e50' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>📍</div>
          <div>Caricamento installazioni da Supabase...</div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', fontFamily: 'Segoe UI, sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '20px' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚠️</div>
          <div style={{ marginBottom: '15px', color: '#c0392b' }}>Errore nel caricamento dati: {loadError}</div>
          <button onClick={loadFromSupabase} style={{ padding: '10px 20px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            🔄 Riprova
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100dvh', width: '100vw', fontFamily: 'Segoe UI, sans-serif', overflow: 'hidden' }}>
      
      {/* SIDEBAR */}
      <div style={{ 
        width: isMobile ? '100%' : '420px', 
        display: (isMobile && mobileView === 'map') ? 'none' : 'flex', 
        flexDirection: 'column', 
        borderRight: isMobile ? 'none' : '1px solid #ddd', 
        background: '#f9f9f9', 
        zIndex: 1000, 
        boxShadow: isMobile ? 'none' : '2px 0 5px rgba(0,0,0,0.1)',
        height: '100%',
        overflow: 'hidden'
      }}>
        
        {/* Header */}
        <div style={{ padding: isMobile ? '12px 15px' : '20px', background: '#2c3e50', color: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h2 style={{ margin: 0, fontSize: isMobile ? '17px' : '20px' }}>📍 Mappa Locali</h2>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              
              <label title="Carica CSV Grezzo" style={{ background: '#e67e22', padding: isMobile ? '6px 8px' : '6px 10px', borderRadius: '4px', cursor: 'pointer', color: 'white', fontSize: isMobile ? '13px' : '14px' }}>
                📂{!isMobile && ' CSV'} <input type="file" accept=".csv" onChange={handleCsvUpload} style={{ display: 'none' }} />
              </label>

              <label title="Carica JSON Salvato" style={{ background: '#16a085', padding: isMobile ? '6px 8px' : '6px 10px', borderRadius: '4px', cursor: 'pointer', color: 'white', fontSize: isMobile ? '13px' : '14px' }}>
                📂{!isMobile && ' JSON'} <input type="file" accept=".json" onChange={handleJsonUpload} style={{ display: 'none' }} />
              </label>

              <button title="Geocoding Tool" onClick={() => setView('tool')} style={{ background: '#8e44ad', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'white', padding: isMobile ? '6px 8px' : '6px 10px' }}>🔧</button>

              <button title="Ricarica da Supabase" onClick={loadFromSupabase} style={{ background: '#2980b9', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'white', padding: isMobile ? '6px 8px' : '6px 10px' }}>🔄</button>
              
              <button title="Scarica JSON (backup locale)" onClick={downloadJSON} style={{ background: '#27ae60', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'white', padding: isMobile ? '6px 8px' : '6px 10px', fontSize: '16px' }}>
                💾
              </button>
            </div>
          </div>

          <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '8px' }}>
             Visualizzati: <strong>{stats.total}</strong> ({stats.mapped} su mappa){saving && ' · 💾 salvataggio...'}
          </div>

          <div style={{ marginTop: '15px', display: 'flex', gap: '5px' }}>
            <button onClick={() => setView('dashboard')} style={{ flex: 1, padding: '8px', cursor: 'pointer', borderRadius: '4px', border: 'none', background: view==='dashboard'?'#34495e':'rgba(255,255,255,0.2)', color: 'white', fontSize:'13px' }}>📊 Dati</button>
            <button onClick={() => setView('list')} style={{ flex: 1, padding: '8px', cursor: 'pointer', borderRadius: '4px', border: 'none', background: view==='list'?'#34495e':'rgba(255,255,255,0.2)', color: 'white', fontSize:'13px' }}>📋 Lista</button>
            <button onClick={() => setView('filters')} style={{ flex: 1, padding: '8px', cursor: 'pointer', borderRadius: '4px', border: 'none', background: view==='filters'?'#34495e':'rgba(255,255,255,0.2)', color: 'white', fontSize:'13px' }}>🌪️ Filtri</button>
          </div>
        </div>

        {/* Content Sidebar */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
          
          {/* 1. DASHBOARD */}
          {view === 'dashboard' && (
            <div style={{ padding: '5px' }}>
              {(filters.regione || filters.provincia || filters.contratto || filters.statoCliente.length > 0) && (
                  <div style={{background: '#ffeaa7', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '13px', borderLeft: '4px solid #fdcb6e', color: '#d35400'}}>
                      ⚠️ Stai vedendo statistiche filtrate. <u style={{cursor:'pointer'}} onClick={() => setFilters({regione:"", provincia:"", contratto:"", statoCliente: []})}>Resetta</u>
                  </div>
              )}

              <div style={{ background: 'white', padding: '15px', borderRadius: '8px', marginBottom: '15px', borderLeft: '5px solid #3498db', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>Riepilogo</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Totale:</span><strong>{stats.total}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Geolocalizzati:</span><strong>{stats.mapped}</strong></div>
              </div>

              <div style={{ background: 'white', padding: '15px', borderRadius: '8px', marginBottom: '15px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>📜 Contratti</h4>
                {stats.byContract.map(([type, count]) => (
                  <div key={type} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '14px', alignItems: 'center' }}>
                    <div style={{display:'flex', alignItems: 'center', gap: '8px'}}>
                       <div style={{width: 10, height: 10, borderRadius: '50%', background: getMarkerColor(type)}}></div>
                       <span>{type}</span>
                    </div>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>

              <div style={{ background: 'white', padding: '15px', borderRadius: '8px', marginBottom: '15px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>📍 Top Regioni</h4>
                {stats.topRegions.slice(0, 10).map(([reg, count]) => (
                  <div key={reg} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '14px' }}>
                    <span>{reg}</span><strong style={{ color: '#2980b9' }}>{count}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. TAB FILTRI */}
          {view === 'filters' && (
             <div style={{ padding: '5px' }}>
                <h3 style={{marginTop: 0, color: '#2c3e50'}}>Imposta Filtri</h3>
                
                <div style={{marginBottom: '15px'}}>
                    <label style={{display:'block', fontWeight: 'bold', marginBottom: '5px', fontSize: '14px'}}>Regione</label>
                    <select value={filters.regione} onChange={(e) => setFilters({...filters, regione: e.target.value, provincia: ""})} style={{width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #bdc3c7'}}>
                        <option value="">Tutte le Regioni</option>
                        {options.regions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
                <div style={{marginBottom: '15px'}}>
                    <label style={{display:'block', fontWeight: 'bold', marginBottom: '5px', fontSize: '14px'}}>Provincia</label>
                    <select value={filters.provincia} onChange={(e) => setFilters({...filters, provincia: e.target.value})} style={{width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #bdc3c7'}}>
                        <option value="">Tutte le Province</option>
                        {options.provinces.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div style={{marginBottom: '20px'}}>
                    <label style={{display:'block', fontWeight: 'bold', marginBottom: '5px', fontSize: '14px'}}>Tipo Contratto</label>
                    <select value={filters.contratto} onChange={(e) => setFilters({...filters, contratto: e.target.value})} style={{width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #bdc3c7'}}>
                        <option value="">Tutti i Contratti</option>
                        {options.contracts.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                <div style={{marginBottom: '20px'}}>
                    <label style={{display:'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', marginBottom: '8px', fontSize: '14px'}}>
                        <span>Stato Cliente</span>
                        {filters.statoCliente.length > 0 && (
                            <span onClick={() => setFilters({...filters, statoCliente: []})} style={{fontWeight: 'normal', fontSize: '12px', color: '#2980b9', cursor: 'pointer'}}>
                                Seleziona tutti
                            </span>
                        )}
                    </label>
                    <div style={{background: 'white', border: '1px solid #bdc3c7', borderRadius: '4px', padding: '8px', maxHeight: '220px', overflowY: 'auto'}}>
                        {options.statiCliente.length === 0 && (
                            <div style={{fontSize: '12px', color: '#999', padding: '4px'}}>Nessuno stato disponibile</div>
                        )}
                        {options.statiCliente.map(stato => (
                            <label key={stato} style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 4px', fontSize: '13px', cursor: 'pointer'}}>
                                <input
                                    type="checkbox"
                                    checked={filters.statoCliente.includes(stato)}
                                    onChange={() => toggleStatoCliente(stato)}
                                />
                                {stato}
                            </label>
                        ))}
                    </div>
                    <div style={{fontSize: '11px', color: '#999', marginTop: '4px'}}>
                        {filters.statoCliente.length === 0
                            ? 'Nessuno selezionato = mostra tutti gli stati'
                            : `${filters.statoCliente.length} stat${filters.statoCliente.length === 1 ? 'o' : 'i'} selezionat${filters.statoCliente.length === 1 ? 'o' : 'i'}`}
                    </div>
                </div>

                <button onClick={() => setFilters({ regione: "", provincia: "", contratto: "", statoCliente: [] })} style={{width: '100%', padding: '12px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>❌ Resetta Filtri</button>
             </div>
          )}

          {/* 3. LISTA CON MODIFICA INLINE */}
          {view === 'list' && (
            <>
              <input type="text" placeholder="Cerca..." onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' }} />
              
              {filteredData.map((r) => {
                const hasCoords = r.lat && r.lng;
                const isSelected = selectedId === r.id;
                const isEditing = editingId === r.id;
                const pinColor = getMarkerColor(r.tipoContratto);

                if (isEditing) {
                    return (
                        <div key={r.id} style={{ background: '#fff3cd', padding: '10px', marginBottom: '8px', borderRadius: '6px', border: '1px solid #f1c40f' }}>
                            <input value={editForm.nomeRistorante} onChange={e => handleEditChange('nomeRistorante', e.target.value)} placeholder="Nome" style={{width: '100%', marginBottom: '5px', padding: '5px'}} />
                            <input value={editForm.indirizzo} onChange={e => handleEditChange('indirizzo', e.target.value)} placeholder="Indirizzo" style={{width: '100%', marginBottom: '5px', padding: '5px'}} />
                            
                            <div style={{display:'flex', gap: '5px', marginBottom: '5px'}}>
                                <input value={editForm.citta} onChange={e => handleEditChange('citta', e.target.value)} placeholder="Città" style={{flex: 2, padding: '5px'}} />
                                <input value={editForm.provincia} onChange={e => handleEditChange('provincia', e.target.value)} placeholder="Prov" style={{width: '50px', padding: '5px'}} />
                                <input value={editForm.regione} onChange={e => handleEditChange('regione', e.target.value)} placeholder="Regione" style={{flex: 1, padding: '5px'}} />
                            </div>

                            <input value={editForm.tipoContratto} onChange={e => handleEditChange('tipoContratto', e.target.value)} placeholder="Contratto" style={{width: '100%', marginBottom: '10px', padding: '5px'}} />
                            
                            <div style={{display:'flex', gap: '5px'}}>
                                <button onClick={saveEditing} style={{flex: 1, background: '#27ae60', color: 'white', border: 'none', padding: '5px', cursor: 'pointer', borderRadius: '3px'}}>✅ Salva</button>
                                <button onClick={cancelEditing} style={{flex: 1, background: '#e74c3c', color: 'white', border: 'none', padding: '5px', cursor: 'pointer', borderRadius: '3px'}}>❌ Annulla</button>
                            </div>
                        </div>
                    );
                }

                return (
                  <div 
                    key={r.id} 
                    onClick={() => handleRowClick(r)} 
                    style={{ 
                      background: isSelected ? '#e3f2fd' : 'white', 
                      padding: '12px', marginBottom: '8px', borderRadius: '6px', cursor: 'pointer', 
                      borderLeft: `5px solid ${pinColor}`, 
                      border: isSelected ? '1px solid #2196f3' : '1px solid transparent',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      position: 'relative'
                    }}
                  >
                    <div onClick={(e) => startEditing(e, r)} title="Modifica Dati" style={{position: 'absolute', top: '10px', right: '10px', fontSize: '16px', cursor: 'pointer', opacity: 0.6}}>✏️</div>
                    <div style={{ fontWeight: 'bold', color: '#2c3e50', paddingRight: '20px' }}>{r.nomeRistorante}</div>
                    <div style={{ fontSize: '12px', color: '#e67e22', fontWeight: '600' }}>📍 {r.indirizzo}</div>
                    <div style={{ fontSize: '12px', color: '#888' }}>{r.citta} ({r.provincia}) - {r.regione}</div>
                    <div style={{ fontSize: '11px', color: pinColor, marginTop: '3px', fontWeight: 'bold' }}>{r.tipoContratto} {r.statoCliente ? `· ${r.statoCliente}` : ''}</div>
                    {isSelected && !hasCoords && (
                      <button onClick={(e) => openGoogleMaps(e, r)} style={{ marginTop: '10px', width: '100%', padding: '8px', background: 'white', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                        🗺️ Vedi su Google Maps
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* MAPPA */}
      <div style={{ 
        flex: 1, 
        position: 'relative', 
        display: (isMobile && mobileView === 'panel') ? 'none' : 'block',
        width: isMobile ? '100%' : 'auto'
      }}>
        {isMobile && (
          <button 
            onClick={() => setMobileView('panel')} 
            style={{ 
              position: 'absolute', top: '12px', left: '12px', zIndex: 1000, 
              padding: '10px 16px', background: '#2c3e50', color: 'white', 
              border: 'none', borderRadius: '20px', cursor: 'pointer', 
              fontSize: '14px', fontWeight: 'bold', boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            ☰ Lista
          </button>
        )}
        <MapContainer center={[42.5, 12.5]} zoom={6} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution='© OpenStreetMap' />
          <MapUpdater center={mapCenter} bounds={mapBounds} />
          <MarkerClusterGroup chunkedLoading maxClusterRadius={60} spiderfyOnMaxZoom={true}>
            {filteredData.map((r, i) => (
              r.lat && r.lng ? (
                <Marker key={r.id} position={[parseFloat(r.lat), parseFloat(r.lng)]} icon={createCustomIcon(r.tipoContratto)}>
                  <Popup>
                    <strong>{r.nomeRistorante}</strong><br/>
                    {r.indirizzo}<br/>
                    {r.citta} ({r.provincia})<br/>
                    <span style={{color: getMarkerColor(r.tipoContratto), fontWeight: 'bold'}}>{r.tipoContratto}</span>
                  </Popup>
                </Marker>
              ) : null
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

      {isMobile && mobileView === 'panel' && (
        <button 
          onClick={() => setMobileView('map')} 
          style={{ 
            position: 'fixed', bottom: '20px', right: '20px', zIndex: 2000, 
            padding: '14px 20px', background: '#3498db', color: 'white', 
            border: 'none', borderRadius: '24px', cursor: 'pointer', 
            fontSize: '14px', fontWeight: 'bold', boxShadow: '0 3px 10px rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          🗺️ Mappa {stats.mapped > 0 ? `(${stats.mapped})` : ''}
        </button>
      )}
    </div>
  );
}
