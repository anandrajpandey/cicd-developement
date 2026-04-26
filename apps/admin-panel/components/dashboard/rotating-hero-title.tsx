'use client';

import { useEffect, useMemo, useState } from 'react';

const HEADLINES = [
  'Debate-driven release intelligence.',
  'Live CI failure analysis and mitigation.',
  'Multi-agent triage for every pipeline risk.',
] as const;

const TYPE_MS = 48;
const DELETE_MS = 26;
const HOLD_MS = 1600;

export function RotatingHeroTitle() {
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const activeHeadline = HEADLINES[headlineIndex];

  useEffect(() => {
    if (!deleting && visibleCount < activeHeadline.length) {
      const timeout = window.setTimeout(() => {
        setVisibleCount((current) => current + 1);
      }, TYPE_MS);

      return () => window.clearTimeout(timeout);
    }

    if (!deleting && visibleCount === activeHeadline.length) {
      const timeout = window.setTimeout(() => {
        setDeleting(true);
      }, HOLD_MS);

      return () => window.clearTimeout(timeout);
    }

    if (deleting && visibleCount > 0) {
      const timeout = window.setTimeout(() => {
        setVisibleCount((current) => current - 1);
      }, DELETE_MS);

      return () => window.clearTimeout(timeout);
    }

    if (deleting && visibleCount === 0) {
      setDeleting(false);
      setHeadlineIndex((current) => (current + 1) % HEADLINES.length);
    }
  }, [activeHeadline.length, deleting, visibleCount]);

  const visibleText = useMemo(
    () => activeHeadline.slice(0, visibleCount),
    [activeHeadline, visibleCount],
  );

  return (
    <h2 className="dashboard-typed-title mt-3 text-5xl font-semibold leading-[1.02] text-white">
      <span className="dashboard-typed-line">
        <span>{visibleText}</span>
        <span className="dashboard-typed-caret" aria-hidden="true">
          |
        </span>
      </span>
    </h2>
  );
}
