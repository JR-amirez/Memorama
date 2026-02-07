import {
  IonBadge,
  IonButton,
  IonCard,
  IonChip,
  IonContent,
  IonIcon,
  IonPage,
  IonPopover,
} from "@ionic/react";
import {
  alertCircleOutline,
  closeCircleOutline,
  exitOutline,
  homeOutline,
  informationCircleOutline,
  pauseCircleOutline,
  playCircleOutline,
  refresh,
  time,
} from "ionicons/icons";
import "./Home.css";
import { useCallback, useEffect, useState } from "react";
import { App } from "@capacitor/app";

type Difficulty = "basic" | "intermediate" | "advanced";

type MemoramaCard = {
  id: number;
  value: string;
  isFlipped: boolean;
  isMatched: boolean;
  isImage: boolean;
};

type DeckValue = {
  value: string;
  isImage: boolean;
};

export interface PlayProps {
  difficulty?: Difficulty;
}

type ConfettiPiece = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
};

type MemoramaRuntimeConfig = {
  nivel?: string;
  autor?: string;
  version?: string;
  fecha?: string;
  descripcion?: string;
  nombreApp?: string;
  plataformas?: string[];
  imagenes?: Record<string, string[]>;
};

type ZipImageEntry = {
  fileName: string;
  bytes: Uint8Array;
};

const SYMBOLS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
];

const SCORE_PER_MATCH = 10;
const SCORE_PENALTY = 2;
const COUNTDOWN_SECONDS = 5;

const DATA_IMAGE_RE = /^data:image\//i;
const IMAGE_FILE_RE = /\.(png|jpe?g|webp|svg)(?:[?#].*)?$/i;
const ZIP_FILE_RE = /\.zip(?:[?#].*)?$/i;
const ASSETS_PREFIX = "/assets/";

const getPairCount = (nivel: Difficulty): number => {
  const mapa: Record<Difficulty, number> = {
    basic: 3,
    intermediate: 4,
    advanced: 5,
  };
  return mapa[nivel] ?? 6;
};

const getTimeLimit = (nivel: Difficulty): number => {
  const mapa: Record<Difficulty, number> = {
    basic: 15,
    intermediate: 20,
    advanced: 30,
  };
  return mapa[nivel] ?? 90;
};

const getBoardColumns = (pairCount: number): number => {
  return pairCount;
};

const shuffleArray = <T,>(items: T[]): T[] => {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const buildDeck = (values: DeckValue[]): MemoramaCard[] => {
  const cards = values.flatMap((item, index) => [
    {
      id: index * 2,
      value: item.value,
      isFlipped: false,
      isMatched: false,
      isImage: item.isImage,
    },
    {
      id: index * 2 + 1,
      value: item.value,
      isFlipped: false,
      isMatched: false,
      isImage: item.isImage,
    },
  ]);
  return shuffleArray(cards);
};

const parseDifficultyKey = (nivel: string): Difficulty | null => {
  const limpio = nivel.toLowerCase();
  const mapa: Record<string, Difficulty> = {
    basico: "basic",
    basic: "basic",
    intermedio: "intermediate",
    intermediate: "intermediate",
    avanzado: "advanced",
    advanced: "advanced",
  };
  return mapa[limpio] ?? null;
};

const stripQueryAndHash = (value: string): string => value.split(/[?#]/)[0];

const resolveAssetPath = (value: string): string => {
  const cleaned = value.trim();
  if (!cleaned) return "";

  if (
    cleaned.startsWith("/") ||
    cleaned.startsWith("http://") ||
    cleaned.startsWith("https://") ||
    cleaned.startsWith("data:") ||
    cleaned.startsWith("blob:")
  ) {
    return cleaned;
  }

  const withoutDotPrefix = cleaned.replace(/^\.\//, "").replace(/^\/+/, "");

  if (withoutDotPrefix.startsWith("assets/")) {
    return `/${withoutDotPrefix}`;
  }

  return `${ASSETS_PREFIX}${withoutDotPrefix}`;
};

const getMimeTypeFromPath = (path: string): string => {
  const extension = stripQueryAndHash(path).split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  return mimeTypes[extension ?? ""] ?? "application/octet-stream";
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return arrayBuffer;
};

const isZipValue = (value: string): boolean => {
  const cleaned = value.trim();
  return ZIP_FILE_RE.test(cleaned);
};

const isImageValue = (value: string): boolean => {
  const cleaned = value.trim();
  if (!cleaned) return false;
  return (
    DATA_IMAGE_RE.test(cleaned) ||
    IMAGE_FILE_RE.test(cleaned) ||
    cleaned.startsWith("blob:") ||
    cleaned.startsWith("/") ||
    cleaned.startsWith("http://") ||
    cleaned.startsWith("https://")
  );
};

const inflateZipData = async (
  compressedData: Uint8Array,
  compressionMethod: number,
): Promise<Uint8Array> => {
  if (compressionMethod === 0) {
    return compressedData;
  }

  if (compressionMethod !== 8) {
    throw new Error(`Metodo ZIP no soportado: ${compressionMethod}`);
  }

  if (typeof DecompressionStream === "undefined") {
    throw new Error("Este navegador no soporta descompresion ZIP.");
  }

  const formats: Array<"deflate-raw" | "deflate"> = ["deflate-raw", "deflate"];

  for (const format of formats) {
    try {
      const stream = new Blob([toArrayBuffer(compressedData)])
        .stream()
        .pipeThrough(new DecompressionStream(format));
      const arrayBuffer = await new Response(stream).arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch {
    }
  }

  throw new Error("No se pudo descomprimir el contenido ZIP.");
};

const extractImageEntriesFromZip = async (
  zipBuffer: ArrayBuffer,
): Promise<ZipImageEntry[]> => {
  const data = new Uint8Array(zipBuffer);
  const view = new DataView(zipBuffer);
  const minEOCDSize = 22;
  const maxCommentLength = 65535;
  const startOffset = Math.max(
    0,
    data.length - (minEOCDSize + maxCommentLength),
  );

  let eocdOffset = -1;
  for (
    let cursor = data.length - minEOCDSize;
    cursor >= startOffset;
    cursor -= 1
  ) {
    if (view.getUint32(cursor, true) === 0x06054b50) {
      eocdOffset = cursor;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error("No se encontro la cabecera central del ZIP.");
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  if (centralDirectoryEnd > data.length) {
    throw new Error("El directorio central del ZIP es invalido.");
  }

  const imageEntries: ZipImageEntry[] = [];
  const decoder = new TextDecoder();
  let cursor = centralDirectoryOffset;

  for (
    let index = 0;
    index < entryCount && cursor < centralDirectoryEnd;
    index += 1
  ) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("Entrada ZIP invalida en el directorio central.");
    }

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const fileName = decoder.decode(data.slice(fileNameStart, fileNameEnd));
    cursor = fileNameEnd + extraLength + commentLength;

    if (fileName.endsWith("/") || !IMAGE_FILE_RE.test(fileName)) {
      continue;
    }

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error(`Cabecera local invalida para ${fileName}.`);
    }

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart =
      localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > data.length) {
      throw new Error(
        `El contenido comprimido de ${fileName} esta incompleto.`,
      );
    }

    const compressedData = data.slice(dataStart, dataEnd);
    const bytes = await inflateZipData(compressedData, compressionMethod);
    imageEntries.push({ fileName, bytes });
  }

  return imageEntries;
};

const loadImagesFromZip = async (zipPath: string): Promise<string[]> => {
  const response = await fetch(zipPath);
  if (!response.ok) {
    throw new Error(`No se pudo descargar ${zipPath}.`);
  }

  const zipBuffer = await response.arrayBuffer();
  const entries = await extractImageEntriesFromZip(zipBuffer);
  return entries.map((entry) => {
    const mimeType = getMimeTypeFromPath(entry.fileName);
    const blob = new Blob([toArrayBuffer(entry.bytes)], { type: mimeType });
    return URL.createObjectURL(blob);
  });
};

const resolveImageSources = async (
  imagesByDifficulty: Partial<Record<Difficulty, string[]>>,
): Promise<{
  valuesByDifficulty: Partial<Record<Difficulty, string[]>>;
  objectUrls: string[];
}> => {
  const valuesByDifficulty: Partial<Record<Difficulty, string[]>> = {};
  const objectUrls: string[] = [];

  for (const [difficultyKey, values] of Object.entries(imagesByDifficulty) as [
    Difficulty,
    string[],
  ][]) {
    const resolvedValues: string[] = [];

    for (const value of values) {
      if (isZipValue(value)) {
        try {
          const zipImages = await loadImagesFromZip(value);
          if (zipImages.length === 0) {
            console.warn(`El ZIP ${value} no contiene imagenes compatibles.`);
            continue;
          }

          resolvedValues.push(...zipImages);
          objectUrls.push(...zipImages);
        } catch (error) {
          console.warn(`No se pudo procesar el ZIP ${value}.`, error);
        }
        continue;
      }

      if (isImageValue(value)) {
        resolvedValues.push(value);
        continue;
      }

      console.warn(`Ruta invalida en memorama-config.json: ${value}`);
    }

    valuesByDifficulty[difficultyKey] = resolvedValues;
  }

  return { valuesByDifficulty, objectUrls };
};

const Home: React.FC<PlayProps> = ({ difficulty = "basic" }) => {
  const [showStartScreen, setShowStartScreen] = useState<boolean>(true);
  const [appNombreJuego, setAppNombreJuego] = useState<string>("STEAM-G");
  const [difficultyConfig, setDifficultyConfig] =
    useState<Difficulty>(difficulty);
  const [showInformation, setShowInformation] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(COUNTDOWN_SECONDS);
  const [showCountdown, setShowCountdown] = useState<boolean>(false);
  const [appDescripcion, setAppDescripcion] = useState<string>(
    "Juego de memorama para fortalecer la memoria y la concentración.",
  );
  const [appFecha, setAppFecha] = useState<string>("2 de Diciembre del 2025");
  const [appVersion, setAppVersion] = useState<string>("1.0");
  const [appPlataformas, setAppPlataformas] = useState<string>("android");
  const [appAutor, setAppAutor] = useState<string>("Valeria C. Z.");
  const [showInstructions, setShowInstructions] = useState<boolean>(false);
  const [showSummary, setShowSummary] = useState<boolean>(false);
  const [showFeedback, setShowFeedback] = useState<boolean>(false);
  const [pausado, setPausado] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [score, setScore] = useState<number>(0);
  const [maxScore, setMaxScore] = useState<number>(0);
  const [tiempoRestante, setTiempoRestante] = useState<number>(0);
  const [cards, setCards] = useState<MemoramaCard[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [matches, setMatches] = useState<number>(0);
  const [attempts, setAttempts] = useState<number>(0);
  const [totalPairs, setTotalPairs] = useState<number>(0);
  const [isBoardLocked, setIsBoardLocked] = useState<boolean>(false);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [imageValuesByDifficulty, setImageValuesByDifficulty] = useState<
    Partial<Record<Difficulty, string[]>>
  >({});
  const [generatedZipImageUrls, setGeneratedZipImageUrls] = useState<string[]>(
    [],
  );
  const [confettiPieces, setConfettiPieces] = useState<ConfettiPiece[]>([]);

  const previewPairCount = getPairCount(difficultyConfig);
  const previewMaxScore = previewPairCount * SCORE_PER_MATCH;

  const dispararFeedback = useCallback((mensaje: string) => {
    setFeedbackMessage(mensaje);
    setShowFeedback(true);
    const timer = setTimeout(() => {
      setShowFeedback(false);
    }, 700);

    return () => clearTimeout(timer);
  }, []);

  const finalizarJuego = useCallback(() => {
    setGameOver(true);
    setShowSummary(true);
    setShowFeedback(false);
    setIsBoardLocked(false);
    setSelectedIndices([]);
  }, []);

  const getDifficultyLabel = (nivel: Difficulty): string => {
    const labels: Record<Difficulty, string> = {
      basic: "Básico",
      intermediate: "Intermedio",
      advanced: "Avanzado",
    };
    return labels[nivel] ?? nivel;
  };

  const generarConfeti = useCallback((cantidad = 60): ConfettiPiece[] => {
    const colores = ["#ff6b6b", "#feca57", "#48dbfb", "#1dd1a1", "#5f27cd"];

    return Array.from({ length: cantidad }, (_, id) => ({
      id,
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 2.5 + Math.random() * 2.5,
      color: colores[Math.floor(Math.random() * colores.length)],
    }));
  }, []);

  useEffect(() => {
    if (!showSummary) {
      setConfettiPieces([]);
      return;
    }

    setConfettiPieces(generarConfeti(70));
  }, [generarConfeti, showSummary]);

  useEffect(() => {
    return () => {
      generatedZipImageUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [generatedZipImageUrls]);

  const formatPlataforma = (texto: string): string => {
    const mapa: Record<string, string> = {
      android: "Android",
      ios: "iOS",
      web: "Web",
    };
    return texto
      .split(/,\s*/)
      .map(
        (p) => mapa[p.toLowerCase()] ?? p.charAt(0).toUpperCase() + p.slice(1),
      )
      .join(", ");
  };

  const normalizarNivelConfig = (nivel: string): Difficulty => {
    const limpio = nivel.toLowerCase();
    const mapa: Record<string, Difficulty> = {
      basico: "basic",
      basic: "basic",
      intermedio: "intermediate",
      intermediate: "intermediate",
      avanzado: "advanced",
      advanced: "advanced",
    };
    return mapa[limpio] ?? "basic";
  };

  const formatearFechaLarga = (isoDate?: string) => {
    if (!isoDate) return appFecha;
    const [year, month, day] = isoDate.split("-");
    const meses = [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",
      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre",
    ];

    const mesIndex = Number(month) - 1;
    if (mesIndex < 0 || mesIndex > 11) return isoDate;

    return `${Number(day)} de ${meses[mesIndex]} del ${year}`;
  };

  const normalizarImagenesConfig = (imagenes: Record<string, string[]>) => {
    const resultado: Partial<Record<Difficulty, string[]>> = {};

    Object.entries(imagenes).forEach(([key, values]) => {
      const nivel = parseDifficultyKey(key);
      if (!nivel || !Array.isArray(values)) return;
      const limpia = values
        .filter((value) => typeof value === "string")
        .map((value) => resolveAssetPath(value))
        .filter(Boolean);
      resultado[nivel] = limpia;
    });

    return resultado;
  };

  const resolveDeckValues = (pairCount: number): DeckValue[] => {
    const hasConfigLevel = Object.prototype.hasOwnProperty.call(
      imageValuesByDifficulty,
      difficultyConfig,
    );
    const candidates = imageValuesByDifficulty[difficultyConfig] ?? [];
    const validImages = candidates.filter(isImageValue);

    if (candidates.length > 0 && validImages.length < candidates.length) {
      console.warn(
        "Algunas imágenes del config no son válidas. Se usarán solo las válidas.",
      );
    }

    if (validImages.length >= pairCount) {
      return validImages.slice(0, pairCount).map((value) => ({
        value,
        isImage: true,
      }));
    }

    if (hasConfigLevel && validImages.length < pairCount) {
      console.warn(
        "No hay suficientes imágenes válidas en el config. Se usarán símbolos.",
      );
    }

    return SYMBOLS.slice(0, pairCount).map((value) => ({
      value,
      isImage: false,
    }));
  };

  useEffect(() => {
    let isCancelled = false;

    const cargarConfig = async () => {
      try {
        const res = await fetch("/config/memorama-config.json");

        if (!res.ok) {
          return;
        }

        const data: MemoramaRuntimeConfig = await res.json();

        if (data.nivel) {
          setDifficultyConfig(normalizarNivelConfig(data.nivel));
        }

        if (data.autor) setAppAutor(data.autor);
        if (data.version) setAppVersion(data.version);
        if (data.fecha) setAppFecha(formatearFechaLarga(data.fecha));
        if (data.descripcion) setAppDescripcion(data.descripcion);
        if (data.plataformas) setAppPlataformas(data.plataformas.join(", "));
        if (data.nombreApp) setAppNombreJuego(data.nombreApp);
        if (data.imagenes) {
          const normalizadas = normalizarImagenesConfig(data.imagenes);
          const { valuesByDifficulty, objectUrls } =
            await resolveImageSources(normalizadas);

          if (isCancelled) {
            objectUrls.forEach((url) => URL.revokeObjectURL(url));
            return;
          }

          setImageValuesByDifficulty(valuesByDifficulty);
          setGeneratedZipImageUrls(objectUrls);
        }
      } catch (err) {
        console.error("No se pudo cargar memorama-config.json", err);
      }
    };

    cargarConfig();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (showCountdown && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    }

    if (showCountdown && countdown === 0) {
      const timer = setTimeout(() => {
        setShowCountdown(false);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [countdown, showCountdown]);

  useEffect(() => {
    if (
      showStartScreen ||
      showCountdown ||
      pausado ||
      showSummary ||
      gameOver ||
      tiempoRestante <= 0
    ) {
      return;
    }

    const timer = setInterval(() => {
      setTiempoRestante((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [
    gameOver,
    pausado,
    showCountdown,
    showStartScreen,
    showSummary,
    tiempoRestante,
  ]);

  useEffect(() => {
    if (showStartScreen || showCountdown || showSummary || gameOver) return;

    if (tiempoRestante <= 0) {
      finalizarJuego();
    }
  }, [
    finalizarJuego,
    gameOver,
    showCountdown,
    showStartScreen,
    showSummary,
    tiempoRestante,
  ]);

  useEffect(() => {
    if (totalPairs > 0 && matches === totalPairs) {
      finalizarJuego();
    }
  }, [finalizarJuego, matches, totalPairs]);

  useEffect(() => {
    if (selectedIndices.length !== 2) return;

    const [firstIndex, secondIndex] = selectedIndices;
    const firstCard = cards[firstIndex];
    const secondCard = cards[secondIndex];

    if (!firstCard || !secondCard) {
      setSelectedIndices([]);
      setIsBoardLocked(false);
      return;
    }

    setAttempts((prev) => prev + 1);

    if (firstCard.value === secondCard.value) {
      setCards((prev) =>
        prev.map((card, index) =>
          index === firstIndex || index === secondIndex
            ? { ...card, isMatched: true }
            : card,
        ),
      );
      setMatches((prev) => prev + 1);
      setScore((prev) => Math.min(prev + SCORE_PER_MATCH, maxScore));
      dispararFeedback("¡Pareja encontrada!");
      setSelectedIndices([]);
      setIsBoardLocked(false);
      return;
    }

    setScore((prev) => Math.max(prev - SCORE_PENALTY, 0));
    dispararFeedback("No coincide");

    const timer = setTimeout(() => {
      setCards((prev) =>
        prev.map((card, index) =>
          index === firstIndex || index === secondIndex
            ? { ...card, isFlipped: false }
            : card,
        ),
      );
      setSelectedIndices([]);
      setIsBoardLocked(false);
    }, 700);

    return () => clearTimeout(timer);
  }, [cards, dispararFeedback, maxScore, selectedIndices]);

  const resetGame = () => {
    const pairCount = getPairCount(difficultyConfig);
    const timeLimit = getTimeLimit(difficultyConfig);
    const nuevoDeck = buildDeck(resolveDeckValues(pairCount));

    setCards(nuevoDeck);
    setSelectedIndices([]);
    setMatches(0);
    setAttempts(0);
    setScore(0);
    setTotalPairs(pairCount);
    setMaxScore(pairCount * SCORE_PER_MATCH);
    setTiempoRestante(timeLimit);
    setGameOver(false);
    setIsBoardLocked(false);
    setFeedbackMessage(null);
    setShowFeedback(false);

    setCountdown(COUNTDOWN_SECONDS);
    setShowCountdown(true);
  };

  const handleSalirDesdePausa = () => {
    setPausado(false);
    handleExitToStart();
  };

  const handleRestartGame = () => {
    setPausado(false);
    setShowSummary(false);
    setShowFeedback(false);
    setShowInstructions(false);
    setShowStartScreen(true);
  };

  const handleExitApp = async () => {
    try {
      await App.exitApp();
    } catch (e) {
      window.close();
    }
  };

  const handleStartGame = () => {
    setShowStartScreen(false);
    resetGame();
  };

  const handleInformation = () => {
    setShowInformation(!showInformation);
  };

  const handlePausar = () => {
    if (
      showStartScreen ||
      showCountdown ||
      showSummary ||
      showInstructions ||
      showFeedback ||
      pausado ||
      gameOver ||
      isBoardLocked
    )
      return;

    setPausado(true);
  };

  const handleResume = () => {
    setPausado(false);
  };

  const handleExitToStart = () => {
    setShowCountdown(false);
    setShowInstructions(false);
    setShowSummary(false);
    setShowFeedback(false);
    setShowStartScreen(true);
    setIsBoardLocked(false);
    setSelectedIndices([]);
    setGameOver(false);
  };

  const handleCardClick = (index: number) => {
    if (
      isBoardLocked ||
      pausado ||
      showCountdown ||
      showSummary ||
      showFeedback ||
      gameOver
    )
      return;

    const card = cards[index];
    if (!card || card.isMatched || card.isFlipped) return;

    setCards((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, isFlipped: true } : item,
      ),
    );

    setSelectedIndices((prev) => {
      if (prev.length >= 2) return prev;
      const next = [...prev, index];
      if (next.length === 2) {
        setIsBoardLocked(true);
      }
      return next;
    });
  };

  const formatearTiempo = (segundos: number) => {
    const minutos = Math.floor(segundos / 60);
    const segs = Math.max(0, segundos % 60);
    return `${minutos}:${segs.toString().padStart(2, "0")}`;
  };

  const boardColumns = getBoardColumns(totalPairs || previewPairCount);

  return (
    <IonPage>
      {showCountdown && countdown > 0 && (
        <div className="countdown-overlay">
          <div className="countdown-number">{countdown}</div>
        </div>
      )}

      {showFeedback && (
        <div className="feedback-overlay">
          <div className="feedback-text">{feedbackMessage}</div>
        </div>
      )}

      {showSummary && (
        <div className="summary-overlay">
          <div className="summary-message">
            {(() => {
              const total = attempts;
              const correctas = matches;
              const incorrectas = Math.max(total - correctas, 0);
              const porcentaje =
                total > 0 ? Math.round((correctas / total) * 100) : 0;
              const etiqueta =
                correctas === totalPairs && totalPairs > 0
                  ? "¡PERFECTO! 🏆"
                  : porcentaje >= 80
                    ? "¡Excelente! 🔥"
                    : porcentaje >= 60
                      ? "¡Buen trabajo! 👍"
                      : "¡Sigue practicando! 💪";

              return (
                <>
                  <h2>Juego Terminado</h2>

                  <div className="resumen-final">
                    <h3>Resultados Finales</h3>

                    <p>
                      <strong>Parejas encontradas:</strong> {matches} /{" "}
                      {totalPairs || previewPairCount}
                    </p>
                    <p>
                      <strong>Puntuación total:</strong> {score} /{" "}
                      {maxScore || previewMaxScore}
                    </p>
                    <p>
                      <strong>Tiempo restante:</strong>{" "}
                      {formatearTiempo(tiempoRestante)}
                    </p>

                    <IonBadge className="badge">{etiqueta}</IonBadge>
                  </div>

                  <IonButton
                    id="finalize"
                    expand="block"
                    onClick={handleRestartGame}
                  >
                    <IonIcon icon={refresh} slot="start" />
                    Jugar de Nuevo
                  </IonButton>

                  <IonButton id="exit" expand="block" onClick={handleExitApp}>
                    <IonIcon slot="start" icon={exitOutline}></IonIcon>
                    Cerrar aplicación
                  </IonButton>
                </>
              );
            })()}
          </div>

          <div className="confetti-container">
            {confettiPieces.map((c) => (
              <div
                key={c.id}
                className="confetti"
                style={{
                  left: `${c.left}%`,
                  animationDelay: `${c.delay}s`,
                  animationDuration: `${c.duration}s`,
                  backgroundColor: c.color,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {showInstructions && (
        <div className="ins-overlay" onClick={() => setShowInstructions(false)}>
          <div className="ins-card" onClick={(e) => e.stopPropagation()}>
            <div className="ins-title">
              <h2
                style={{ margin: 0, fontWeight: "bold", color: "var(--dark)" }}
              >
                Reglas Básicas
              </h2>
              <IonIcon
                icon={closeCircleOutline}
                style={{ fontSize: "26px", color: "var(--dark)" }}
                onClick={() => setShowInstructions(false)}
              />
            </div>

            <div className="ins-stats">
              <p style={{ textAlign: "justify" }}>
                <strong>
                  Voltea dos cartas por turno. Si son iguales, la pareja queda
                  descubierta. Si no coinciden, se voltearán de nuevo. Gana al
                  encontrar todas las parejas antes de que el tiempo termine.
                </strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {showInformation && (
        <div className="info-modal-background">
          <div className="info-modal">
            <div className="header">
              <h2 style={{ color: "var(--color-primary)", fontWeight: "bold" }}>
                {appNombreJuego}
              </h2>
              <p
                style={{
                  color: "#8b8b8bff",
                  marginTop: "5px",
                  textAlign: "center",
                }}
              >
                Actividad configurada desde la plataforma Steam-G
              </p>
            </div>
            <div className="cards-info">
              <div className="card">
                <p className="title">VERSIÓN</p>
                <p className="data">{appVersion}</p>
              </div>
              <div className="card">
                <p className="title">FECHA DE CREACIÓN</p>
                <p className="data">{appFecha}</p>
              </div>
              <div className="card">
                <p className="title">PLATAFORMAS</p>
                <p className="data">{formatPlataforma(appPlataformas)}</p>
              </div>
              <div className="card">
                <p className="title">NÚMERO DE PAREJAS</p>
                <p className="data">{previewPairCount}</p>
              </div>
              <div className="card description">
                <p className="title">DESCRIPCIÓN</p>
                <p className="data">{appDescripcion}</p>
              </div>
            </div>
            <div className="button">
              <IonButton expand="full" onClick={handleInformation}>
                Cerrar
              </IonButton>
            </div>
          </div>
        </div>
      )}

      {pausado && (
        <div className="pause-overlay">
          <div className="pause-card">
            <h2>Juego en pausa</h2>
            <p>El tiempo está detenido.</p>

            <IonButton
              expand="block"
              id="resume"
              style={{ marginTop: "16px" }}
              onClick={handleResume}
            >
              <IonIcon slot="start" icon={playCircleOutline}></IonIcon>
              Reanudar
            </IonButton>

            <IonButton
              expand="block"
              id="finalize"
              style={{ marginTop: "10px" }}
              onClick={handleSalirDesdePausa}
            >
              <IonIcon slot="start" icon={homeOutline}></IonIcon>
              Finalizar juego
            </IonButton>

            <IonButton
              expand="block"
              id="exit"
              style={{ marginTop: "10px" }}
              onClick={handleExitApp}
            >
              <IonIcon slot="start" icon={exitOutline}></IonIcon>
              Cerrar aplicación
            </IonButton>
          </div>
        </div>
      )}

      <IonContent fullscreen className="ion-padding">
        {showStartScreen ? (
          <div className="inicio-container">
            <div className="header-game ion-no-border">
              <div className="toolbar-game">
                <div className="titles start-page">
                  <h1>{appNombreJuego}</h1>
                </div>
              </div>
            </div>

            <div className="info-juego">
              <div className="info-item">
                <IonChip>
                  <strong>Nivel: {getDifficultyLabel(difficultyConfig)}</strong>
                </IonChip>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
              className="page-start-btns"
            >
              <IonButton onClick={handleStartGame} className="play">
                <IonIcon slot="start" icon={playCircleOutline}></IonIcon>
                Iniciar juego
              </IonButton>
              <IonButton onClick={handleInformation} className="info">
                <IonIcon slot="start" icon={informationCircleOutline}></IonIcon>
                Información
              </IonButton>
            </div>
          </div>
        ) : (
          <>
            <div className="header-game ion-no-border">
              <div className="toolbar-game">
                <div className="titles">
                  <h1>STEAM-G</h1>
                  <IonIcon
                    icon={alertCircleOutline}
                    size="small"
                    id="info-icon"
                  />
                  <IonPopover
                    trigger="info-icon"
                    side="bottom"
                    alignment="center"
                  >
                    <IonCard className="filter-card ion-no-margin">
                      <div className="section header-section">
                        <h2>{appNombreJuego}</h2>
                      </div>

                      <div className="section description-section">
                        <p>{appDescripcion}</p>
                      </div>

                      <div className="section footer-section">
                        <span>{appFecha}</span>
                      </div>
                    </IonCard>
                  </IonPopover>
                </div>
                <span>
                  <strong>{appNombreJuego}</strong>
                </span>
              </div>
            </div>

            <div className="instructions-exercises">
              <div
                className="num-words rules"
                onClick={() => setShowInstructions(true)}
              >
                <strong>Reglas Básicas</strong>
              </div>

              <div className="temporizador">
                <IonIcon icon={time} className="icono-tiempo" />
                <h5 className="tiempo-display">
                  {formatearTiempo(tiempoRestante)}
                </h5>
              </div>

              <div className="num-words">
                <strong>Puntuación: {score}</strong>
                {/* <span className="substat">
                  Parejas: {matches} / {totalPairs || previewPairCount}
                </span> */}
              </div>
            </div>

            <div className="videogame">
              <div className="memorama-title">
                <span className="substat">
                  Parejas: {matches} / {totalPairs || previewPairCount}
                </span>
              </div>
              <div className="memorama-board"
                style={{
                  gridTemplateColumns: `repeat(${boardColumns}, minmax(0, 1fr))`,
                }}
              >
                {cards.map((card, index) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`mem-card ${
                      card.isFlipped ? "flipped" : ""
                    } ${card.isMatched ? "matched" : ""}`}
                    onClick={() => handleCardClick(index)}
                    disabled={
                      card.isMatched ||
                      pausado ||
                      showCountdown ||
                      showSummary ||
                      showFeedback ||
                      isBoardLocked ||
                      gameOver
                    }
                  >
                    <div className="mem-card-inner">
                      <div className="mem-card-face mem-card-front">
                        {appNombreJuego}
                      </div>
                      <div className="mem-card-face mem-card-back">
                        {card.isImage ? (
                          <img src={card.value} alt="Carta" />
                        ) : (
                          card.value
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="button game">
              <IonButton
                shape="round"
                expand="full"
                onClick={handlePausar}
                disabled={
                  showCountdown ||
                  showFeedback ||
                  showSummary ||
                  showInstructions ||
                  pausado ||
                  isBoardLocked ||
                  gameOver
                }
              >
                <IonIcon slot="start" icon={pauseCircleOutline} />
                Pausar
              </IonButton>
            </div>
          </>
        )}
      </IonContent>
    </IonPage>
  );
};

export default Home;
