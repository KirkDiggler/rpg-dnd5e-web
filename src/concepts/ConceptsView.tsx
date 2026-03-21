import { motion } from 'framer-motion';
import { useState } from 'react';
import { ClassSelectionConcept } from './class-selection/ClassSelectionConcept';

type ConceptPage = 'class-selection';

const CONCEPT_PAGES: { id: ConceptPage; label: string }[] = [
  { id: 'class-selection', label: 'Class Selection' },
];

interface ConceptsViewProps {
  onBack: () => void;
}

export function ConceptsView({ onBack }: ConceptsViewProps) {
  const [activePage, setActivePage] = useState<ConceptPage>('class-selection');

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded text-sm"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            Back
          </button>
          <h1
            className="text-3xl font-bold"
            style={{
              fontFamily: 'Cinzel, serif',
              color: 'var(--text-primary)',
            }}
          >
            Concepts Lab
          </h1>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex gap-2 mb-6">
        {CONCEPT_PAGES.map((page) => (
          <button
            key={page.id}
            onClick={() => setActivePage(page.id)}
            className="px-4 py-2 rounded text-sm font-medium transition-colors"
            style={{
              backgroundColor:
                activePage === page.id
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border:
                activePage === page.id
                  ? '1px solid var(--accent-primary)'
                  : '1px solid var(--border-primary)',
            }}
          >
            {page.label}
          </button>
        ))}
      </div>

      {/* Active concept page */}
      <motion.div
        key={activePage}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activePage === 'class-selection' && <ClassSelectionConcept />}
      </motion.div>
    </div>
  );
}
