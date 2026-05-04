import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";

const API_URL = "http://127.0.0.1:8000/schools/nearby";
const DEFAULT_SEARCH = {
  lat: "40.4168",
  lng: "-3.7038",
  radius_km: "5",
};
const SORTABLE_COLUMNS = {
  distance_km: "Distancia km",
  name: "Nombre",
  municipality: "Municipio",
  ownership: "Titularidad",
};
const CSV_COLUMNS = [
  "id",
  "name",
  "address",
  "municipality",
  "province",
  "ownership",
  "education_levels",
  "latitude",
  "longitude",
  "distance_km",
];

function formatLevels(levels) {
  return Array.isArray(levels) ? levels.join(", ") : "";
}

function compareValues(left, right, key) {
  if (key === "distance_km") {
    return Number(left[key]) - Number(right[key]);
  }

  return String(left[key] ?? "").localeCompare(String(right[key] ?? ""), "es", {
    sensitivity: "base",
  });
}

function escapeCsvValue(value) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function sortSchools(schoolsToSort, sortConfig) {
  return [...schoolsToSort].sort((left, right) => {
    const result = compareValues(left, right, sortConfig.key);
    return sortConfig.direction === "asc" ? result : -result;
  });
}

function App() {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const formRef = useRef(DEFAULT_SEARCH);
  const [form, setForm] = useState(DEFAULT_SEARCH);
  const [schools, setSchools] = useState([]);
  const [status, setStatus] = useState("Introduce una ubicacion y busca centros cercanos.");
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: "distance_km", direction: "asc" });
  const [selectedSchoolIds, setSelectedSchoolIds] = useState(() => new Set());
  const [myList, setMyList] = useState([]);
  const [myListSortConfig, setMyListSortConfig] = useState({ key: "distance_km", direction: "asc" });

  const center = useMemo(
    () => [Number(form.lat) || Number(DEFAULT_SEARCH.lat), Number(form.lng) || Number(DEFAULT_SEARCH.lng)],
    [form.lat, form.lng],
  );
  const sortedSchools = useMemo(() => {
    return sortSchools(schools, sortConfig);
  }, [schools, sortConfig]);
  const sortedMyList = useMemo(() => {
    return sortSchools(myList, myListSortConfig);
  }, [myList, myListSortConfig]);
  const myListIds = useMemo(() => {
    return new Set(myList.map((school) => school.id));
  }, [myList]);
  const selectedVisibleSchools = useMemo(() => {
    return sortedSchools.filter((school) => selectedSchoolIds.has(school.id));
  }, [selectedSchoolIds, sortedSchools]);
  const addableSelectedSchools = useMemo(() => {
    return selectedVisibleSchools.filter((school) => !myListIds.has(school.id));
  }, [myListIds, selectedVisibleSchools]);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapElementRef.current, {
      center,
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (event) => {
      const nextForm = {
        ...formRef.current,
        lat: event.latlng.lat.toFixed(6),
        lng: event.latlng.lng.toFixed(6),
      };

      setForm(nextForm);
      runSearch(nextForm);
    });
    mapRef.current = map;
  }, [center]);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) {
      return;
    }

    const radiusKm = Number(form.radius_km) || Number(DEFAULT_SEARCH.radius_km);
    const layer = layerRef.current;
    layer.clearLayers();

    mapRef.current.setView(center, radiusKm > 10 ? 10 : 12);

    L.circle(center, {
      radius: radiusKm * 1000,
      color: "#2563eb",
      fillColor: "#93c5fd",
      fillOpacity: 0.12,
      weight: 2,
    }).addTo(layer);

    L.circleMarker(center, {
      radius: 10,
      color: "#7f1d1d",
      fillColor: "#ef4444",
      fillOpacity: 0.95,
      weight: 3,
    })
      .bindPopup("Punto de busqueda")
      .addTo(layer);

    sortedSchools.forEach((school) => {
      L.circleMarker([school.latitude, school.longitude], {
        radius: 8,
        color: "#0f172a",
        fillColor: "#16a34a",
        fillOpacity: 0.9,
        weight: 2,
      })
        .bindPopup(
          `<strong>${school.name}</strong><br>${school.municipality}<br>${school.distance_km} km`,
        )
        .addTo(layer);
    });
  }, [center, form.radius_km, sortedSchools]);

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => {
      const nextForm = { ...current, [name]: value };
      formRef.current = nextForm;
      return nextForm;
    });
  }

  async function runSearch(searchValues) {
    setIsLoading(true);
    setStatus("Buscando centros...");

    const params = new URLSearchParams({
      lat: searchValues.lat,
      lng: searchValues.lng,
      radius_km: searchValues.radius_km,
    });

    try {
      const response = await fetch(`${API_URL}?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setSchools(data);
      setSelectedSchoolIds(new Set());
      setStatus(data.length === 1 ? "1 centro encontrado." : `${data.length} centros encontrados.`);
    } catch (error) {
      setSchools([]);
      setStatus("No se pudo consultar el backend. Revisa que FastAPI este arrancado.");
    } finally {
      setIsLoading(false);
    }
  }

  function searchSchools(event) {
    event.preventDefault();
    runSearch(form);
  }

  function changeSort(key) {
    setSortConfig((current) => toggleSort(current, key));
  }

  function changeMyListSort(key) {
    setMyListSortConfig((current) => toggleSort(current, key));
  }

  function toggleSort(current, key) {
    if (current.key === key) {
      return {
        key,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    }

    return { key, direction: "asc" };
  }

  function getSortLabel(key, currentSortConfig) {
    if (currentSortConfig.key !== key) {
      return "";
    }

    return currentSortConfig.direction === "asc" ? " ASC" : " DESC";
  }

  function getAriaSort(key, currentSortConfig) {
    if (currentSortConfig.key !== key) {
      return "none";
    }

    return currentSortConfig.direction === "asc" ? "ascending" : "descending";
  }

  function downloadCsv(rowsToDownload, filename) {
    if (rowsToDownload.length === 0) {
      return;
    }

    const rows = [
      CSV_COLUMNS.join(","),
      ...rowsToDownload.map((school) =>
        CSV_COLUMNS.map((column) => escapeCsvValue(school[column])).join(","),
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function toggleSchoolSelection(schoolId) {
    if (myListIds.has(schoolId)) {
      return;
    }

    setSelectedSchoolIds((current) => {
      const nextSelection = new Set(current);

      if (nextSelection.has(schoolId)) {
        nextSelection.delete(schoolId);
      } else {
        nextSelection.add(schoolId);
      }

      return nextSelection;
    });
  }

  function addSelectedToMyList() {
    if (addableSelectedSchools.length === 0) {
      return;
    }

    setMyList((current) => {
      return [...current, ...addableSelectedSchools];
    });
    setSelectedSchoolIds(new Set());
  }

  function removeFromMyList(schoolId) {
    setMyList((current) => current.filter((school) => school.id !== schoolId));
  }

  function getLocationErrorMessage(error) {
    if (error.code === error.PERMISSION_DENIED) {
      return "No se pudo usar tu ubicacion porque el permiso fue denegado. Puedes introducir latitud y longitud manualmente.";
    }

    if (error.code === error.TIMEOUT) {
      return "No se pudo obtener tu ubicacion a tiempo. Puedes introducir latitud y longitud manualmente.";
    }

    return "No se pudo obtener tu ubicacion. Puedes introducir latitud y longitud manualmente.";
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setStatus("Tu navegador no soporta geolocalizacion. Puedes introducir latitud y longitud manualmente.");
      return;
    }

    setIsLocating(true);
    setStatus("Obteniendo tu ubicacion...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextForm = {
          ...form,
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6),
        };

        setForm(nextForm);
        setIsLocating(false);
        runSearch(nextForm);
      },
      (error) => {
        setIsLocating(false);
        setStatus(getLocationErrorMessage(error));
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }

  return (
    <main className="app-shell">
      <section className="toolbar" aria-label="Busqueda de centros">
        <div>
          <h1>Destino Docente</h1>
          <p>Centros educativos cercanos</p>
          <p className="help-text">
            Haz clic en el mapa o usa tu ubicacion actual para elegir el punto de busqueda.
          </p>
        </div>

        <form className="search-form" onSubmit={searchSchools}>
          <label>
            Radio km
            <input
              name="radius_km"
              type="number"
              min="0.1"
              max="100"
              step="0.1"
              value={form.radius_km}
              onChange={updateForm}
              required
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={isLoading || isLocating}>
              {isLoading ? "Buscando" : "Buscar"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={isLoading || isLocating}
              onClick={useCurrentLocation}
            >
              {isLocating ? "Ubicando" : "Usar mi ubicación"}
            </button>
          </div>
          <details className="advanced-controls">
            <summary>Coordenadas avanzadas</summary>
            <div className="coordinate-fields">
              <label>
                Latitud
                <input name="lat" type="number" step="any" value={form.lat} onChange={updateForm} required />
              </label>
              <label>
                Longitud
                <input name="lng" type="number" step="any" value={form.lng} onChange={updateForm} required />
              </label>
            </div>
          </details>
        </form>
      </section>

      <section className="workspace">
        <div className="map-panel">
          <div ref={mapElementRef} className="map" aria-label="Mapa de centros educativos" />
        </div>

        <div className="results-panel">
          <div className="results-header">
            <div>
              <h2>Resultados</h2>
              <span>{status}</span>
            </div>
            <button
              className="download-button"
              type="button"
              disabled={sortedSchools.length === 0}
              onClick={() => downloadCsv(sortedSchools, "schools-nearby.csv")}
            >
              Descargar CSV
            </button>
            <button
              className="download-button primary-action"
              type="button"
              disabled={addableSelectedSchools.length === 0}
              onClick={addSelectedToMyList}
            >
              Añadir a mi lista
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="select-column">Sel.</th>
                  <th aria-sort={getAriaSort("name", sortConfig)}>
                    <button
                      className={sortConfig.key === "name" ? "sort-button active" : "sort-button"}
                      type="button"
                      onClick={() => changeSort("name")}
                    >
                      {SORTABLE_COLUMNS.name}
                      <span>{getSortLabel("name", sortConfig)}</span>
                    </button>
                  </th>
                  <th aria-sort={getAriaSort("municipality", sortConfig)}>
                    <button
                      className={sortConfig.key === "municipality" ? "sort-button active" : "sort-button"}
                      type="button"
                      onClick={() => changeSort("municipality")}
                    >
                      {SORTABLE_COLUMNS.municipality}
                      <span>{getSortLabel("municipality", sortConfig)}</span>
                    </button>
                  </th>
                  <th aria-sort={getAriaSort("ownership", sortConfig)}>
                    <button
                      className={sortConfig.key === "ownership" ? "sort-button active" : "sort-button"}
                      type="button"
                      onClick={() => changeSort("ownership")}
                    >
                      {SORTABLE_COLUMNS.ownership}
                      <span>{getSortLabel("ownership", sortConfig)}</span>
                    </button>
                  </th>
                  <th>Niveles</th>
                  <th aria-sort={getAriaSort("distance_km", sortConfig)}>
                    <button
                      className={sortConfig.key === "distance_km" ? "sort-button active" : "sort-button"}
                      type="button"
                      onClick={() => changeSort("distance_km")}
                    >
                      {SORTABLE_COLUMNS.distance_km}
                      <span>{getSortLabel("distance_km", sortConfig)}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSchools.map((school) => {
                  const isInMyList = myListIds.has(school.id);

                  return (
                    <tr className={isInMyList ? "listed-row" : ""} key={school.id}>
                      <td className="select-column">
                        <input
                          aria-label={
                            isInMyList
                              ? `${school.name} ya esta en mi lista`
                              : `Seleccionar ${school.name}`
                          }
                          checked={!isInMyList && selectedSchoolIds.has(school.id)}
                          disabled={isInMyList}
                          type="checkbox"
                          onChange={() => toggleSchoolSelection(school.id)}
                        />
                      </td>
                      <td>
                        <div className="school-name-cell">
                          <span>{school.name}</span>
                          {isInMyList && <span className="status-badge">En mi lista</span>}
                        </div>
                      </td>
                      <td>{school.municipality}</td>
                      <td>{school.ownership}</td>
                      <td>{formatLevels(school.education_levels)}</td>
                      <td>{school.distance_km}</td>
                    </tr>
                  );
                })}
                {sortedSchools.length === 0 && (
                  <tr>
                    <td colSpan="6" className="empty-state">
                      Sin resultados para mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <section className="my-list-section" aria-label="Mi lista">
            <div className="results-header list-header">
              <div>
                <h2>Mi lista</h2>
                <span>
                  {myList.length === 1 ? "1 centro seleccionado." : `${myList.length} centros seleccionados.`}
                </span>
              </div>
              <button
                className="download-button"
                type="button"
                disabled={sortedMyList.length === 0}
                onClick={() => downloadCsv(sortedMyList, "mi-lista-centros.csv")}
              >
                Descargar mi lista CSV
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th aria-sort={getAriaSort("name", myListSortConfig)}>
                      <button
                        className={myListSortConfig.key === "name" ? "sort-button active" : "sort-button"}
                        type="button"
                        onClick={() => changeMyListSort("name")}
                      >
                        {SORTABLE_COLUMNS.name}
                        <span>{getSortLabel("name", myListSortConfig)}</span>
                      </button>
                    </th>
                    <th aria-sort={getAriaSort("municipality", myListSortConfig)}>
                      <button
                        className={myListSortConfig.key === "municipality" ? "sort-button active" : "sort-button"}
                        type="button"
                        onClick={() => changeMyListSort("municipality")}
                      >
                        {SORTABLE_COLUMNS.municipality}
                        <span>{getSortLabel("municipality", myListSortConfig)}</span>
                      </button>
                    </th>
                    <th aria-sort={getAriaSort("ownership", myListSortConfig)}>
                      <button
                        className={myListSortConfig.key === "ownership" ? "sort-button active" : "sort-button"}
                        type="button"
                        onClick={() => changeMyListSort("ownership")}
                      >
                        {SORTABLE_COLUMNS.ownership}
                        <span>{getSortLabel("ownership", myListSortConfig)}</span>
                      </button>
                    </th>
                    <th>Niveles</th>
                    <th aria-sort={getAriaSort("distance_km", myListSortConfig)}>
                      <button
                        className={myListSortConfig.key === "distance_km" ? "sort-button active" : "sort-button"}
                        type="button"
                        onClick={() => changeMyListSort("distance_km")}
                      >
                        {SORTABLE_COLUMNS.distance_km}
                        <span>{getSortLabel("distance_km", myListSortConfig)}</span>
                      </button>
                    </th>
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMyList.map((school) => (
                    <tr key={school.id}>
                      <td>{school.name}</td>
                      <td>{school.municipality}</td>
                      <td>{school.ownership}</td>
                      <td>{formatLevels(school.education_levels)}</td>
                      <td>{school.distance_km}</td>
                      <td>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => removeFromMyList(school.id)}
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sortedMyList.length === 0 && (
                    <tr>
                      <td colSpan="6" className="empty-state">
                        Selecciona centros de los resultados y añadelos a tu lista.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

export default App;
