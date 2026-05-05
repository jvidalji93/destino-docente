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
const DEFAULT_SCORE_CRITERIA = {
  distance: true,
  municipality: false,
  preferredMunicipalities: "",
  ownership: false,
  preferredOwnership: "",
  educationLevel: false,
  preferredEducationLevel: "",
};
const MY_LIST_STORAGE_KEY = "destino-docente.my-list";
const SORTABLE_COLUMNS = {
  distance_km: "Distancia km",
  name: "Nombre",
  municipality: "Municipio",
  ownership: "Titularidad",
  score: "Puntuacion",
};
const BASE_CSV_COLUMNS = [
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
const SCORE_CSV_COLUMN = "score";
const NOTES_CSV_COLUMN = "notes";

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
  if (key === "distance_km" || key === "score") {
    return Number(left[key] ?? 0) - Number(right[key] ?? 0);
  }

  return String(left[key] ?? "").localeCompare(String(right[key] ?? ""), "es", {
    sensitivity: "base",
  });
}

function escapeCsvValue(value) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function getCsvColumns(rows, extraColumns = []) {
  const hasScore = rows.some((school) => school.score !== undefined && school.score !== null);
  const columns = hasScore ? [...BASE_CSV_COLUMNS, SCORE_CSV_COLUMN] : [...BASE_CSV_COLUMNS];

  extraColumns.forEach((column) => {
    if (!columns.includes(column)) {
      columns.push(column);
    }
  });

  return columns;
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

function normalizeForMatch(value) {
  return String(value ?? "").trim().toLocaleLowerCase("es");
}

function getPreferredMunicipalities(value) {
  return value
    .split(",")
    .map((municipality) => normalizeForMatch(municipality))
    .filter(Boolean);
}

function calculateSchoolScore(school, scoreCriteria, radiusKm) {
  let score = 0;
  const distanceKm = Number(school.distance_km);
  const searchRadiusKm = Number(radiusKm) || Number(DEFAULT_SEARCH.radius_km);

  if (scoreCriteria.distance && Number.isFinite(distanceKm) && searchRadiusKm > 0) {
    const normalizedDistance = Math.min(distanceKm, searchRadiusKm) / searchRadiusKm;
    score += Math.max(0, Math.round((1 - normalizedDistance) * 50));
  }

  if (scoreCriteria.municipality) {
    const preferredMunicipalities = getPreferredMunicipalities(scoreCriteria.preferredMunicipalities);
    if (preferredMunicipalities.includes(normalizeForMatch(school.municipality))) {
      score += 20;
    }
  }

  if (scoreCriteria.ownership && scoreCriteria.preferredOwnership === school.ownership) {
    score += 15;
  }

  if (
    scoreCriteria.educationLevel &&
    getEducationLevels(school.education_levels).includes(scoreCriteria.preferredEducationLevel)
  ) {
    score += 15;
  }

  return score;
}

function stripDerivedSchoolFields(school) {
  const { score, ...storedSchool } = school;
  return storedSchool;
}

function getActiveLabel(count) {
  if (count === 0) {
    return "Sin activos";
  }

  return count === 1 ? "1 activo" : `${count} activos`;
}

function truncateSummaryValue(value) {
  const text = String(value ?? "").trim();
  return text.length > 32 ? `${text.slice(0, 29)}...` : text;
}

function countValues(values) {
  return values.filter(Boolean).reduce((counts, value) => {
    return {
      ...counts,
      [value]: (counts[value] ?? 0) + 1,
    };
  }, {});
}

function getEducationLevelCombination(levels) {
  const educationLevels = getEducationLevels(levels);
  return educationLevels.length > 0 ? educationLevels.join(" + ") : "";
}

function formatUniqueList(values, limit = 4) {
  const uniqueValues = uniqueSorted(values);

  if (uniqueValues.length === 0) {
    return "Sin datos";
  }

  const visibleValues = uniqueValues.slice(0, limit);
  const remainingCount = uniqueValues.length - visibleValues.length;
  return remainingCount > 0 ? `${visibleValues.join(" · ")} · +${remainingCount} más` : visibleValues.join(" · ");
}

function formatCounts(counts, limit = 4) {
  const entries = Object.entries(counts).sort((left, right) => {
    const countComparison = right[1] - left[1];
    return countComparison !== 0
      ? countComparison
      : left[0].localeCompare(right[0], "es", { sensitivity: "base" });
  });

  if (entries.length === 0) {
    return "Sin datos";
  }

  const visibleEntries = entries.slice(0, limit).map(([label, count]) => `${label}: ${count}`);
  const remainingCount = entries.length - visibleEntries.length;
  return remainingCount > 0 ? `${visibleEntries.join(" · ")} · +${remainingCount}` : visibleEntries.join(" · ");
}

function loadStoredMyList() {
  try {
    const storedValue = window.localStorage.getItem(MY_LIST_STORAGE_KEY);
    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    return [];
  }
}

function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "default",
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="confirm-dialog"
        role="dialog"
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="dialog-actions">
          <button className="dialog-cancel-button" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={variant === "danger" ? "dialog-confirm-button danger" : "dialog-confirm-button"}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
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
  const [scoreCriteria, setScoreCriteria] = useState(DEFAULT_SCORE_CRITERIA);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scoreCriteriaOpen, setScoreCriteriaOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("search");
  const [addFeedbackCount, setAddFeedbackCount] = useState(0);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [selectedSchoolIds, setSelectedSchoolIds] = useState(() => new Set());
  const [myList, setMyList] = useState(loadStoredMyList);
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
  const scoredSchools = useMemo(() => {
    const radiusKm = Number(form.radius_km) || Number(DEFAULT_SEARCH.radius_km);
    return filteredSchools.map((school) => ({
      ...school,
      score: calculateSchoolScore(school, scoreCriteria, radiusKm),
    }));
  }, [filteredSchools, form.radius_km, scoreCriteria]);
  const sortedSchools = useMemo(() => {
    return sortSchools(scoredSchools, sortConfig);
  }, [scoredSchools, sortConfig]);
  const sortedMyList = myList;
  const myListSummary = useMemo(() => {
    const distances = myList
      .map((school) => Number(school.distance_km))
      .filter((distance) => Number.isFinite(distance));
    const averageDistance =
      distances.length > 0
        ? distances.reduce((total, distance) => total + distance, 0) / distances.length
        : null;

    return {
      total: myList.length,
      averageDistance,
      municipalities: myList.map((school) => school.municipality),
      ownershipCounts: countValues(myList.map((school) => school.ownership)),
      educationLevelCombinationCounts: countValues(
        myList.map((school) => getEducationLevelCombination(school.education_levels)),
      ),
    };
  }, [myList]);
  const selectedVisibleSchools = useMemo(() => {
    return sortedSchools.filter((school) => selectedSchoolIds.has(school.id));
  }, [selectedSchoolIds, sortedSchools]);
  const addableSelectedSchools = useMemo(() => {
    return selectedVisibleSchools.filter((school) => !myListIds.has(school.id));
  }, [myListIds, selectedVisibleSchools]);
  const activeFilterChips = useMemo(() => {
    const activeFilters = [];

    if (filters.text.trim()) {
      activeFilters.push({ key: "text", label: `Texto: ${truncateSummaryValue(filters.text)}` });
    }

    if (filters.province) {
      activeFilters.push({ key: "province", label: `Provincia: ${filters.province}` });
    }

    if (filters.municipality) {
      activeFilters.push({ key: "municipality", label: `Municipio: ${filters.municipality}` });
    }

    if (filters.ownership) {
      activeFilters.push({ key: "ownership", label: `Titularidad: ${filters.ownership}` });
    }

    if (filters.educationLevel) {
      activeFilters.push({ key: "educationLevel", label: `Nivel: ${filters.educationLevel}` });
    }

    if (filters.maxDistanceKm) {
      activeFilters.push({ key: "maxDistanceKm", label: `Distancia max.: ${filters.maxDistanceKm} km` });
    }

    if (filters.hideListed) {
      activeFilters.push({ key: "hideListed", label: "Oculta centros en mi lista" });
    }

    return activeFilters;
  }, [filters]);
  const activeFilterSummary = useMemo(() => {
    return {
      count: activeFilterChips.length,
      text: activeFilterChips.map((filter) => filter.label).join(" · "),
    };
  }, [activeFilterChips]);
  const activeScoreSummary = useMemo(() => {
    const activeCriteria = [];

    if (scoreCriteria.distance) {
      activeCriteria.push("Distancia");
    }

    if (scoreCriteria.municipality) {
      activeCriteria.push(
        scoreCriteria.preferredMunicipalities.trim()
          ? `Municipio preferido: ${truncateSummaryValue(scoreCriteria.preferredMunicipalities)}`
          : "Municipio preferido",
      );
    }

    if (scoreCriteria.ownership) {
      activeCriteria.push(
        scoreCriteria.preferredOwnership
          ? `Titularidad: ${scoreCriteria.preferredOwnership}`
          : "Titularidad preferida",
      );
    }

    if (scoreCriteria.educationLevel) {
      activeCriteria.push(
        scoreCriteria.preferredEducationLevel
          ? `Nivel: ${scoreCriteria.preferredEducationLevel}`
          : "Nivel preferido",
      );
    }

    return {
      count: activeCriteria.length,
      text: activeCriteria.join(" · "),
    };
  }, [scoreCriteria]);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    window.localStorage.setItem(MY_LIST_STORAGE_KEY, JSON.stringify(myList));
  }, [myList]);

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

  function updateScoreCriteria(event) {
    const { checked, name, type, value } = event.target;
    setScoreCriteria((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function clearFilter(filterKey) {
    setFilters((current) => ({
      ...current,
      [filterKey]: typeof current[filterKey] === "boolean" ? false : "",
    }));
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
    setMyListSortConfig((current) => {
      const nextSortConfig = toggleSort(current, key);
      setMyList((currentMyList) => sortSchools(currentMyList, nextSortConfig));
      return nextSortConfig;
    });
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

  function downloadCsv(rowsToDownload, filename, extraColumns = []) {
    if (rowsToDownload.length === 0) {
      return;
    }

    const csvColumns = getCsvColumns(rowsToDownload, extraColumns);
    const rows = [
      csvColumns.join(","),
      ...rowsToDownload.map((school) =>
        csvColumns.map((column) => escapeCsvValue(school[column])).join(","),
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

    const addedCount = addableSelectedSchools.length;

    setMyList((current) => {
      return [
        ...current,
        ...addableSelectedSchools.map((school) => ({
          ...stripDerivedSchoolFields(school),
          notes: "",
        })),
      ];
    });
    setAddFeedbackCount(addedCount);
    setSelectedSchoolIds(new Set());
  }

  function removeFromMyList(schoolId) {
    const schoolToRemove = myList.find((school) => school.id === schoolId);
    const hasNotes = String(schoolToRemove?.notes ?? "").trim().length > 0;

    if (!schoolToRemove) {
      return;
    }

    setConfirmDialog({
      title: hasNotes ? "Quitar centro con nota" : "Quitar centro de Mi lista",
      message: hasNotes
        ? "Este centro tiene una nota personal. Si lo quitas, también se eliminará la nota. ¿Quieres continuar?"
        : "¿Seguro que quieres quitar este centro de Mi lista?",
      confirmLabel: "Quitar centro",
      cancelLabel: "Cancelar",
      variant: "danger",
      onConfirm: () => {
        setMyList((current) => current.filter((school) => school.id !== schoolId));
      },
    });
  }

  function moveMyListItem(index, direction) {
    setMyList((current) => {
      const targetIndex = index + direction;

      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const nextList = [...current];
      const [movedSchool] = nextList.splice(index, 1);
      nextList.splice(targetIndex, 0, movedSchool);
      return nextList;
    });
  }

  function updateMyListNotes(schoolId, notes) {
    setMyList((current) =>
      current.map((school) => (school.id === schoolId ? { ...school, notes } : school)),
    );
  }

  function clearMyList() {
    if (myList.length === 0) {
      return;
    }

    setConfirmDialog({
      title: "Vaciar Mi lista",
      message: "Vas a eliminar todos los centros seleccionados. Esta acción no se puede deshacer.",
      confirmLabel: "Vaciar lista",
      cancelLabel: "Cancelar",
      variant: "danger",
      onConfirm: () => {
        setMyList([]);
      },
    });
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
    <main className={`app-shell active-tab-${activeTab}`}>
      <nav className="tab-nav" aria-label="Navegacion principal">
        <button
          aria-selected={activeTab === "search"}
          className={activeTab === "search" ? "tab-button active" : "tab-button"}
          role="tab"
          type="button"
          onClick={() => setActiveTab("search")}
        >
          Buscar centros
        </button>
        <button
          aria-selected={activeTab === "list"}
          className={activeTab === "list" ? "tab-button active" : "tab-button"}
          role="tab"
          type="button"
          onClick={() => setActiveTab("list")}
        >
          Mi lista ({myList.length})
        </button>
      </nav>

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

          <section className="collapsible-section filters-section" aria-label="Filtros de resultados">
            <button
              aria-expanded={filtersOpen}
              className="collapsible-header"
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              <span className="collapsible-title">
                <span className="collapse-indicator">{filtersOpen ? "▾" : "▸"}</span>
                Filtros
              </span>
              <span className={activeFilterSummary.count > 0 ? "active-badge" : "active-badge muted"}>
                {getActiveLabel(activeFilterSummary.count)}
              </span>
            </button>
            {!filtersOpen && activeFilterSummary.count > 0 && (
              <p className="collapsed-summary">{activeFilterSummary.text}</p>
            )}
            {filtersOpen && (
              <div className="filters-panel">
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
              </div>
            )}
          </section>

          <section className="collapsible-section scoring-section" aria-label="Criterios de ordenacion">
            <button
              aria-expanded={scoreCriteriaOpen}
              className="collapsible-header"
              type="button"
              onClick={() => setScoreCriteriaOpen((current) => !current)}
            >
              <span className="collapsible-title">
                <span className="collapse-indicator">{scoreCriteriaOpen ? "▾" : "▸"}</span>
                Criterios de puntuacion
              </span>
              <span className={activeScoreSummary.count > 0 ? "active-badge" : "active-badge muted"}>
                {getActiveLabel(activeScoreSummary.count)}
              </span>
            </button>
            {!scoreCriteriaOpen && activeScoreSummary.count > 0 && (
              <p className="collapsed-summary">{activeScoreSummary.text}</p>
            )}
            {scoreCriteriaOpen && (
              <div className="scoring-panel">
                <div className="scoring-heading">
                  <p>
                    Puntuacion orientativa: distancia hasta 50 puntos, municipio preferido +20,
                    titularidad +15 y nivel educativo +15.
                  </p>
                </div>

                <label className="score-toggle">
              <input
                checked={scoreCriteria.distance}
                name="distance"
                type="checkbox"
                onChange={updateScoreCriteria}
              />
              Menor distancia
            </label>

            <label className="score-field score-field-wide">
              <span>
                <input
                  checked={scoreCriteria.municipality}
                  name="municipality"
                  type="checkbox"
                  onChange={updateScoreCriteria}
                />
                Municipio preferido
              </span>
              <input
                disabled={!scoreCriteria.municipality}
                name="preferredMunicipalities"
                placeholder="Madrid, Getafe, Leganes"
                type="text"
                value={scoreCriteria.preferredMunicipalities}
                onChange={updateScoreCriteria}
              />
            </label>

            <label className="score-field">
              <span>
                <input
                  checked={scoreCriteria.ownership}
                  name="ownership"
                  type="checkbox"
                  onChange={updateScoreCriteria}
                />
                Titularidad preferida
              </span>
              <select
                disabled={!scoreCriteria.ownership}
                name="preferredOwnership"
                value={scoreCriteria.preferredOwnership}
                onChange={updateScoreCriteria}
              >
                <option value="">Selecciona</option>
                {ownershipOptions.map((ownership) => (
                  <option key={ownership} value={ownership}>
                    {ownership}
                  </option>
                ))}
              </select>
            </label>

            <label className="score-field">
              <span>
                <input
                  checked={scoreCriteria.educationLevel}
                  name="educationLevel"
                  type="checkbox"
                  onChange={updateScoreCriteria}
                />
                Nivel preferido
              </span>
              <select
                disabled={!scoreCriteria.educationLevel}
                name="preferredEducationLevel"
                value={scoreCriteria.preferredEducationLevel}
                onChange={updateScoreCriteria}
              >
                <option value="">Selecciona</option>
                {educationLevelOptions.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
              </div>
            )}
          </section>

          {activeFilterChips.length > 0 && (
            <section className="active-filters-row" aria-label="Filtros activos">
              <span className="active-filters-label">Filtros activos:</span>
              <div className="filter-chips">
                {activeFilterChips.map((filter) => (
                  <span className="filter-chip" key={filter.key}>
                    {filter.label}
                    <button
                      aria-label={`Quitar filtro ${filter.label}`}
                      type="button"
                      onClick={() => clearFilter(filter.key)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}

          {addFeedbackCount > 0 && (
            <section className="add-feedback" aria-live="polite">
              <span>
                {addFeedbackCount === 1
                  ? "Se ha añadido 1 centro a Mi lista"
                  : `Se han añadido ${addFeedbackCount} centros a Mi lista`}
              </span>
              <button type="button" onClick={() => setActiveTab("list")}>
                Ver mi lista
              </button>
            </section>
          )}

          <div className="table-wrap results-table-wrap">
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
                  <th aria-sort={getAriaSort("score", sortConfig)}>
                    <button
                      className={sortConfig.key === "score" ? "sort-button active" : "sort-button"}
                      type="button"
                      onClick={() => changeSort("score")}
                    >
                      {SORTABLE_COLUMNS.score}
                      <span>{getSortLabel("score", sortConfig)}</span>
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
                      <td>{school.score}</td>
                    </tr>
                  );
                })}
                {sortedSchools.length === 0 && (
                  <tr>
                    <td colSpan="7" className="empty-state">
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
                onClick={() => downloadCsv(sortedMyList, "mi-lista-centros.csv", [NOTES_CSV_COLUMN])}
              >
                Descargar mi lista CSV
              </button>
              <button
                className="download-button danger-action"
                type="button"
                disabled={myList.length === 0}
                onClick={clearMyList}
              >
                Vaciar mi lista
              </button>
            </div>

            <div className="my-list-summary" aria-label="Resumen de mi lista">
              {myListSummary.total === 0 ? (
                <p className="my-list-empty-summary">Mi lista esta vacia. Añade centros para ver el resumen.</p>
              ) : (
                <div className="summary-grid">
                  <div className="summary-item">
                    <span>Total</span>
                    <strong>{myListSummary.total}</strong>
                  </div>
                  <div className="summary-item">
                    <span>Distancia media</span>
                    <strong>
                      {myListSummary.averageDistance === null
                        ? "Sin datos"
                        : `${myListSummary.averageDistance.toFixed(2)} km`}
                    </strong>
                  </div>
                  <div className="summary-item summary-item-wide">
                    <span>Municipios</span>
                    <strong>{formatUniqueList(myListSummary.municipalities, 4)}</strong>
                  </div>
                  <div className="summary-item summary-item-wide">
                    <span>Titularidad</span>
                    <strong>{formatCounts(myListSummary.ownershipCounts)}</strong>
                  </div>
                  <div className="summary-item summary-item-wide">
                    <span>Enseñanzas de los centros seleccionados</span>
                    <strong>{formatCounts(myListSummary.educationLevelCombinationCounts)}</strong>
                  </div>
                </div>
              )}
            </div>

            <div className="table-wrap my-list-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pos.</th>
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
                    <th>Notas</th>
                    <th>Orden</th>
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMyList.map((school, index) => (
                    <tr key={school.id}>
                      <td className="position-column">{index + 1}</td>
                      <td>{school.name}</td>
                      <td>{school.municipality}</td>
                      <td>{school.ownership}</td>
                      <td>{formatLevels(school.education_levels)}</td>
                      <td>{school.distance_km}</td>
                      <td>
                        <textarea
                          aria-label={`Notas para ${school.name}`}
                          className="notes-input"
                          placeholder="Añade una nota"
                          rows="2"
                          value={school.notes ?? ""}
                          onChange={(event) => updateMyListNotes(school.id, event.target.value)}
                        />
                      </td>
                      <td>
                        <div className="order-controls">
                          <button
                            aria-label={`Subir ${school.name}`}
                            className="order-button"
                            disabled={index === 0}
                            type="button"
                            onClick={() => moveMyListItem(index, -1)}
                          >
                            ↑
                          </button>
                          <button
                            aria-label={`Bajar ${school.name}`}
                            className="order-button"
                            disabled={index === sortedMyList.length - 1}
                            type="button"
                            onClick={() => moveMyListItem(index, 1)}
                          >
                            ↓
                          </button>
                        </div>
                      </td>
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
                      <td colSpan="9" className="empty-state">
                        Selecciona centros de los resultados y a??delos a tu lista.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
      <ConfirmDialog
        isOpen={Boolean(confirmDialog)}
        title={confirmDialog?.title ?? ""}
        message={confirmDialog?.message ?? ""}
        confirmLabel={confirmDialog?.confirmLabel ?? "Confirmar"}
        cancelLabel={confirmDialog?.cancelLabel ?? "Cancelar"}
        variant={confirmDialog?.variant}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => {
          confirmDialog?.onConfirm();
          setConfirmDialog(null);
        }}
      />
    </main>
  );
}

export default App;
