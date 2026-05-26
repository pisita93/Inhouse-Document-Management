import { useState } from 'react';
import { DocumentTypesTab } from './settings/DocumentTypesTab.js';
import { CategoriesTab } from './settings/CategoriesTab.js';

type Tab = 'tags' | 'categories' | 'document-types';

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('document-types');
  return (
    <div className="settings-page">
      <header>
        <h1>
          Settings <span className="settings-page__hint">(Admin)</span>
        </h1>
      </header>
      <nav className="settings-page__tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'document-types'}
          onClick={() => setTab('document-types')}
        >
          Document Types
        </button>
        <button
          role="tab"
          aria-selected={tab === 'categories'}
          onClick={() => setTab('categories')}
        >
          Categories
        </button>
        <button role="tab" aria-selected={tab === 'tags'} onClick={() => setTab('tags')}>
          Tags
        </button>
      </nav>
      <section role="tabpanel" className="settings-page__panel">
        {tab === 'document-types' && <DocumentTypesTab />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'tags' && <TagsTab />}
      </section>
    </div>
  );
}

function TagsTab() {
  return <p>tags tab</p>;
}
