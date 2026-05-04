import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";

const API_URL = "http://127.0.0.1:8000/schools/nearby";
const DEFAULT_SEARCH = {
  lat: "40.4168",
  lng: "-3.7038",
  radius_km: "5",
};
const DEFAULT_FILTERS = {
  text: "",
  province: "",
  municipality: "",
  ownership: "",
  educationLevel: "",
  maxDistanceKm: "",
  hideListed: false,
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
  return getEducationLevels(levels).join(", ");
}

function getEducationLevels(levels) {
  if (Array.isArray(levels)) {
    return levels.map((level) => String(level).trim()).filter(Boolean);
  }

  return String(levels ?? "")
    .split("|")
    .map((level) => level.trim())
    .filter(Boolean);
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

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "es", { sensitivity: "base" }),
  );
}

function matchesText(school, text) {
  if (!text.trim()) {
    return true;
  }

  const query = text.trim().toLocaleLowerCase("es");
  return [school.name, school.address, school.municipality, school.province].some((value) =>
    String(value ?? "").toLocaleLowerCase("es").includes(query),
  );
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
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedSchoolIds, setSelectedSchoolIds] = useState(() => new Set());
  const [myList, setMyList] = useState([]);
  const [myListSortConfig, setMyListSortConfig] = useState({ key: "distance_km", direction: "asc" });

  const center = useMemo(
    () => [Number(form.lat) || Number(DEFAULT_SEARCH.lat), Number(form.lng) || Number(DEFAULT_SEARCH.lng)],
    [form.lat, form.lng],
  );
  const myListIds = useMemo(() => {
    return new Set(myList.map((school) => school.id));
  }, [myList]);
  const provinceOptions = useMemo(() => {
    return uniqueSorted(schools.map((school) => school.province));
  }, [schools]);
  const municipalityOptions = useMemo(() => {
    return uniqueSorted(
      schools
        .filter((school) => !filters.province || school.province === filters.province)
        .map((school) => school.municipality),
    );
  }, [filters.province, schools]);
  const ownershipOptions = useMemo(() => {
    return uniqueSorted(schools.map((school) => school.ownership));
  }, [schools]);
  const educationLevelOptions = useMemo(() => {
    return uniqueSorted(schools.flatMap((school) => getEducationLevels(school.education_levels)));
  }, [schools]);
  const filteredSchools = useMemo(() => {
    const maxDistance = Number(filters.maxDistanceKm);
    const radiusKm = Number(form.radius_km) || Number(DEFAULT_SEARCH.radius_km);

    return schools.filter((school) => {
      if (!matchesText(school, filters.text)) {
        return false;
      }

      if (filters.province && school.province !== filters.province) {
        return false;
      }

      if (filters.municipality && school.municipality !== filters.municipality) {
        return false;
      }

      if (filters.ownership && school.ownership !== filters.ownership) {
        return false;
      }

      if (
        filters.educationLevel &&
        !getEducationLevels(school.education_levels).includes(filters.educationLevel)
      ) {
        return false;
      }

      if (filters.hideListed && myListIds.has(school.id)) {
        return false;
      }

      if (filters.maxDistanceKm && Number(school.distance_km) > Math.min(maxDistance, radiusKm)) {
        return false;
      }

      return true;
    });
  }, [filters, form.radius_km, myListIds, schools]);
  const sortedSchools = useMemo(() => {
    return sortSchools(filteredSchools, sortConfig);
  }, [filteredSchools, sortConfig]);
  const sortedMyList = useMemo(() => {
    return sortSchools(myList, myListSortConfig);
  }, [myList, myListSortConfig]);
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
    const radiusKm = Number(form.radius_km) || Number(DEFAULT_SEARCH.radius_km);

    setFilters((current) => {
      if (!current.maxDistanceKm || Number(current.maxDistanceKm) <= radiusKm) {
        return current;
      }

      return { ...current, maxDistanceKm: String(radiusKm) };
    });
  }, [form.radius_km]);

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
      const isInMyList = myListIds.has(school.id);

      L.circleMarker([school.latitude, school.longitude], {
        radius: isInMyList ? 9 : 8,
        color: isInMyList ? "#92400e" : "#0f172a",
        fillColor: isInMyList ? "#f59e0b" : "#16a34a",
        fillOpacity: 0.9,
        weight: isInMyList ? 3 : 2,
      })
        .bindPopup(
          `<strong>${school.name}</strong><br>${school.municipality}<br>${school.distance_km} km${
            isInMyList ? "<br>En mi lista" : ""
          }`,
        )
        .addTo(layer);
    });
  }, [center, form.radius_km, myListIds, sortedSchools]);

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => {
      const nextForm = { ...current, [name]: value };
      formRef.current = nextForm;
      return nextForm;
    });
  }

  function updateFilter(event) {
    const { checked, name, type, value } = event.target;
    const radiusKm = Number(form.radius_km) || Number(DEFAULT_SEARCH.radius_km);

    setFilters((current) => {
      const nextFilters = {
        ...current,
        [name]: type === "checkbox" ? checked : value,
      };

      if (name === "province") {
        nextFilters.municipality = "";
      }

      if (name === "maxDistanceKm" && value !== "") {
        const requestedDistance = Number(value);
        nextFilters.maxDistanceKm = Number.isFinite(requestedDistance)
          ? String(Math.max(0, Math.min(requestedDistance, radiusKm)))
          : current.maxDistanceKm;
      }

      return nextFilters;
    });
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
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
          <div className="map-legend" aria-label="Leyenda del mapa">
            <span>
              <i className="legend-dot legend-search" />
              Ubicación de búsqueda
            </span>
            <span>
              <i className="legend-dot legend-school" />
              Centro encontrado
            </span>
            <span>
              <i className="legend-dot legend-listed" />
              Centro en mi lista
            </span>
          </div>
        </div>

        <div className="results-panel">
          <div className="results-header">
            <div>
              <h2>Resultados</h2>
              <span>{status}</span>
              <span className="result-count">
                Mostrando {sortedSchools.length} de {schools.length} centros
              </span>
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

          <section className="filters-panel" aria-label="Filtros de resultados">
            <label className="filter-field filter-field-wide">
              Texto libre
              <input
                name="text"
                placeholder="Nombre, direccion, municipio o provincia"
                type="search"
                value={filters.text}
                onChange={updateFilter}
              />
            </label>

            <label className="filter-field">
              Provincia
              <select name="province" value={filters.province} onChange={updateFilter}>
                <option value="">Todas</option>
                {provinceOptions.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field">
              Municipio
              <select name="municipality" value={filters.municipality} onChange={updateFilter}>
                <option value="">Todos</option>
                {municipalityOptions.map((municipality) => (
                  <option key={municipality} value={municipality}>
                    {municipality}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field">
              Titularidad
              <select name="ownership" value={filters.ownership} onChange={updateFilter}>
                <option value="">Todas</option>
                {ownershipOptions.map((ownership) => (
                  <option key={ownership} value={ownership}>
                    {ownership}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field">
              Nivel educativo
              <select name="educationLevel" value={filters.educationLevel} onChange={updateFilter}>
                <option value="">Todos</option>
                {educationLevelOptions.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field">
              Distancia max. km
              <input
                max={Number(form.radius_km) || Number(DEFAULT_SEARCH.radius_km)}
                min="0"
                name="maxDistanceKm"
                step="0.1"
                type="number"
                value={filters.maxDistanceKm}
                onChange={updateFilter}
              />
            </label>

            <label className="filter-check">
              <input
                checked={filters.hideListed}
                name="hideListed"
                type="checkbox"
                onChange={updateFilter}
              />
              Ocultar centros ya añadidos a mi lista
            </label>

            <button className="download-button" type="button" onClick={clearFilters}>
              Limpiar filtros
            </button>
          </section>

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
                      No hay centros que coincidan con los filtros actuales.
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
