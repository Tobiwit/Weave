import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Notice';
import { COPY } from '../config/app';
import { comparePlaylists } from '../features/playlists/playlistInsights';
import { moodStateFromPlaylist, NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import { buildUniverse, type UniverseData } from '../features/universe/buildUniverse';
import { usePanZoom } from '../hooks/usePanZoom';
import { useReducedMotion } from '../hooks/useReducedMotion';
import './universe.css';

/** World units across the shorter viewport edge. Lower means a larger map. */
const WORLD = 2.45;

export default function UniversePage() {
  const [data, setData] = useState<UniverseData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { transform, reset, wasDragged, handlers } = usePanZoom();
  const reducedMotion = useReducedMotion();
  const navigate = useNavigate();

  useMoodEnvironment(NEUTRAL_MOOD, { resolution: 0.42, quality: 0.6 });

  useEffect(() => {
    let cancelled = false;
    buildUniverse()
      .then((result) => !cancelled && setData(result))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(size.width, size.height) / WORLD;
  const toScreen = (x: number, y: number) => ({
    x: size.width / 2 + x * scale,
    y: size.height / 2 + y * scale,
  });

  const selectedNodes = useMemo(
    () => (data ? data.nodes.filter((node) => selected.includes(node.id)) : []),
    [data, selected],
  );

  const relatedIds = useMemo(() => {
    if (!data || selected.length !== 1) return new Set<string>();
    const ids = new Set<string>();
    for (const link of data.links) {
      if (link.from === selected[0]) ids.add(link.to);
      if (link.to === selected[0]) ids.add(link.from);
    }
    return ids;
  }, [data, selected]);

  const toggle = (id: string) => {
    if (wasDragged()) return;
    setSelected((current) => {
      if (current.includes(id)) return current.filter((c) => c !== id);
      if (current.length >= 2) return [id];
      return [...current, id];
    });
  };

  if (failed || (data && data.nodes.length === 0)) {
    return (
      <div className="page universe universe--empty">
        <h1 className="u-title">{COPY.universeHeading}</h1>
        <EmptyState title="There is nothing to map yet.">
          Create a couple of playlists and their worlds will appear here.
        </EmptyState>
        <Button variant="primary" onClick={() => navigate('/playlists/new')}>
          Create a playlist
        </Button>
      </div>
    );
  }

  return (
    <div className="page page--full universe">
      <div className="universe__head">
        <h1 className="u-title">{COPY.universeHeading}</h1>
        <p className="u-meta">{COPY.universeSub}</p>
      </div>

      <div
        ref={containerRef}
        className="universe__canvas"
        {...handlers}
        onClick={(event) => {
          if (event.target === event.currentTarget && !wasDragged()) setSelected([]);
        }}
      >
        {size.width > 0 && data && (
          <svg
            width={size.width}
            height={size.height}
            className="universe__svg"
            role="img"
            aria-label={describeUniverse(data)}
          >
            <defs>
              {data.nodes.map((node) => {
                const mood = moodStateFromPlaylist(node.playlist);
                return (
                  <radialGradient key={node.id} id={`region-${node.id}`}>
                    <stop
                      offset="0%"
                      stopColor={`hsl(${mood.hueA}, 70%, 62%)`}
                      stopOpacity={0.38}
                    />
                    <stop
                      offset="55%"
                      stopColor={`hsl(${mood.hueB}, 66%, 54%)`}
                      stopOpacity={0.14}
                    />
                    <stop offset="100%" stopColor={`hsl(${mood.hueB}, 60%, 46%)`} stopOpacity={0} />
                  </radialGradient>
                );
              })}
              <filter id="region-soften" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="10" />
              </filter>
            </defs>

            <g
              transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}
            >
              {/* Connections between neighbouring worlds, shown on selection. */}
              {data.links.map((link) => {
                const a = data.nodes.find((n) => n.id === link.from);
                const b = data.nodes.find((n) => n.id === link.to);
                if (!a || !b) return null;
                const visible =
                  selected.length === 0 ||
                  selected.includes(link.from) ||
                  selected.includes(link.to);
                const pa = toScreen(a.x, a.y);
                const pb = toScreen(b.x, b.y);
                const mx = (pa.x + pb.x) / 2;
                const my = (pa.y + pb.y) / 2 - Math.abs(pa.x - pb.x) * 0.12;
                return (
                  <path
                    key={`${link.from}-${link.to}`}
                    d={`M ${pa.x} ${pa.y} Q ${mx} ${my} ${pb.x} ${pb.y}`}
                    fill="none"
                    stroke="rgba(247,244,238,0.5)"
                    strokeWidth={0.4 + (link.score / 100) * 1.4}
                    opacity={visible ? 0.12 + (link.score / 100) * 0.3 : 0.04}
                    className="universe__link"
                  />
                );
              })}

              {/* Soft regions first, so nodes and labels read above them. */}
              <g filter="url(#region-soften)">
                {data.nodes.map((node) => {
                  const point = toScreen(node.x, node.y);
                  const dimmed =
                    selected.length > 0 &&
                    !selected.includes(node.id) &&
                    !relatedIds.has(node.id);
                  return (
                    <circle
                      key={node.id}
                      cx={point.x}
                      cy={point.y}
                      r={node.radius * scale}
                      fill={`url(#region-${node.id})`}
                      opacity={dimmed ? 0.22 : 1}
                      className="universe__region"
                    />
                  );
                })}
              </g>

              {data.songPoints.map((point) => {
                const screen = toScreen(point.x, point.y);
                const dimmed =
                  selected.length > 0 && !selected.includes(point.playlistId);
                return (
                  <circle
                    key={point.id}
                    cx={screen.x}
                    cy={screen.y}
                    r={1.6}
                    fill="rgba(247,244,238,0.75)"
                    opacity={dimmed ? 0.12 : 0.5}
                    className="universe__song"
                  />
                );
              })}

              {data.nodes.map((node) => {
                const point = toScreen(node.x, node.y);
                const isSelected = selected.includes(node.id);
                const dimmed =
                  selected.length > 0 && !isSelected && !relatedIds.has(node.id);
                return (
                  <g
                    key={node.id}
                    className="universe__node"
                    opacity={dimmed ? 0.3 : 1}
                    onClick={() => toggle(node.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.playlist.name}, ${node.playlist.songIds.length} songs`}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelected((current) =>
                          current.includes(node.id)
                            ? current.filter((c) => c !== node.id)
                            : [...current.slice(-1), node.id],
                        );
                      }
                    }}
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={isSelected ? 7 : 5}
                      fill="var(--c-text)"
                      opacity={isSelected ? 1 : 0.82}
                    />
                    <text
                      x={point.x}
                      y={point.y - 14}
                      textAnchor="middle"
                      className="universe__label"
                      fontSize={13 / Math.max(1, transform.scale * 0.6)}
                    >
                      {node.playlist.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {!data && <p className="universe__loading u-meta">Mapping your worlds…</p>}
      </div>

      <div className="universe__controls">
        <Button variant="quiet" size="sm" onClick={reset}>
          Recentre
        </Button>
      </div>

      <AnimatePresence>
        {selectedNodes.length > 0 && (
          <motion.div
            className="universe__panel"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={{ duration: 0.4, ease: [0.16, 0.84, 0.28, 1] }}
          >
            {selectedNodes.length === 1 ? (
              <SingleSelection
                node={selectedNodes[0]}
                data={data!}
                onOpen={(id) => navigate(`/playlists/${id}`)}
              />
            ) : (
              <PairSelection a={selectedNodes[0]} b={selectedNodes[1]} data={data!} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SingleSelection({
  node,
  data,
  onOpen,
}: {
  node: UniverseData['nodes'][number];
  data: UniverseData;
  onOpen: (id: string) => void;
}) {
  const neighbours = data.links
    .filter((link) => link.from === node.id || link.to === node.id)
    .map((link) => ({
      id: link.from === node.id ? link.to : link.from,
      score: link.score,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return (
    <>
      <div className="universe__panelHead">
        <h2 className="u-section">{node.playlist.name}</h2>
        <Button variant="quiet" size="sm" onClick={() => onOpen(node.id)}>
          Open
        </Button>
      </div>
      <p className="u-meta universe__panelDesc">
        {node.playlist.keywords.slice(0, 5).join(' · ')}
      </p>
      {neighbours.length > 0 && (
        <ul className="universe__neighbours">
          {neighbours.map((neighbour) => {
            const other = data.nodes.find((n) => n.id === neighbour.id);
            if (!other) return null;
            return (
              <li key={neighbour.id}>
                <span>{other.playlist.name}</span>
                <span className="universe__neighbourScore">{neighbour.score}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function PairSelection({
  a,
  b,
  data,
}: {
  a: UniverseData['nodes'][number];
  b: UniverseData['nodes'][number];
  data: UniverseData;
}) {
  const link = data.links.find(
    (l) =>
      (l.from === a.id && l.to === b.id) || (l.from === b.id && l.to === a.id),
  );
  const comparison = comparePlaylists(a.playlist, b.playlist);

  return (
    <>
      <div className="universe__panelHead">
        <h2 className="u-section">
          {a.playlist.name} × {b.playlist.name}
        </h2>
        {link && <span className="universe__overlap">{link.score}% overlap</span>}
      </div>

      {comparison.shared.length > 0 && (
        <p className="universe__pairRow">
          <span className="u-eyebrow">Shared</span>
          {comparison.shared.join(' · ')}
        </p>
      )}
      {comparison.towardA.length > 0 && (
        <p className="universe__pairRow">
          <span className="u-eyebrow">Toward {a.playlist.name}</span>
          {comparison.towardA.slice(0, 4).join(' · ')}
        </p>
      )}
      {comparison.towardB.length > 0 && (
        <p className="universe__pairRow">
          <span className="u-eyebrow">Toward {b.playlist.name}</span>
          {comparison.towardB.slice(0, 4).join(' · ')}
        </p>
      )}
    </>
  );
}

/** Spatial views need a textual equivalent for anyone not reading the picture. */
function describeUniverse(data: UniverseData): string {
  const names = data.nodes.map((node) => node.playlist.name).join(', ');
  const closest = [...data.links].sort((a, b) => b.score - a.score)[0];
  const relation = closest
    ? ` The closest pair is ${
        data.nodes.find((n) => n.id === closest.from)?.playlist.name
      } and ${data.nodes.find((n) => n.id === closest.to)?.playlist.name} at ${
        closest.score
      } out of 100.`
    : '';
  return `A map of ${data.nodes.length} playlist worlds: ${names}.${relation}`;
}
