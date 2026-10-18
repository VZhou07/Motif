import { useId, useState } from 'react';
import type { Result } from '../domain/types';
import { FAVOURITES_ID, VOCABULARY_LIMITS, type PhraseGroup, type Vocabulary, type VocabularyEdit } from '../app/vocabulary';

/**
 * Helper (conventional input) editor for phrase groups (R14). Every change goes through one typed
 * vocabulary edit; refusals are shown inline in plain words and change nothing.
 */
export function PhraseEditor({ vocabulary, onEdit, disabled = false, hideFavourites = false }: {
  vocabulary: Vocabulary;
  /** Flat board (R19): the hidden Favourites group is not offered for editing; its saved phrases stay stored. */
  hideFavourites?: boolean;
  onEdit: (edit: VocabularyEdit) => Result<Vocabulary>;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState('');
  const errorId = useId();
  const edit = (change: VocabularyEdit): boolean => {
    const result = onEdit(change);
    setError(result.ok ? null : result.reasons[0] ?? 'That change is not possible.');
    return result.ok;
  };
  const full = vocabulary.groups.length >= VOCABULARY_LIMITS.groups;
  return (
    <div className="phrase-editor">
      {error && <p id={errorId} className="status-notice">{error}</p>}
      {vocabulary.groups.filter((group) => !(hideFavourites && group.id === FAVOURITES_ID)).map((group) => (
        <GroupEditor key={group.id} group={group} edit={edit} disabled={disabled} describedBy={error ? errorId : undefined} />
      ))}
      <div className="editor-row">
        <label className="text-field">New group name
          <input value={newGroup} maxLength={VOCABULARY_LIMITS.nameMax} disabled={disabled || full}
            onChange={(event) => setNewGroup(event.target.value)} />
        </label>
        <button type="button" className="button" disabled={disabled || full || !newGroup.trim()}
          onClick={() => { if (edit({ kind: 'add-group', name: newGroup })) setNewGroup(''); }}>Add group</button>
      </div>
      {full && <p className="helper-copy">There can be at most {VOCABULARY_LIMITS.groups} groups, including Favourites.</p>}
    </div>
  );
}

function GroupEditor({ group, edit, disabled, describedBy }: {
  group: PhraseGroup; edit: (change: VocabularyEdit) => boolean; disabled: boolean; describedBy: string | undefined;
}) {
  const favourites = group.id === FAVOURITES_ID;
  const [name, setName] = useState(group.name);
  const [phrase, setPhrase] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const count = group.phrases.length;
  return (
    <fieldset className="group-editor" aria-describedby={describedBy}>
      <legend>{group.name} · {count} phrase{count === 1 ? '' : 's'}</legend>
      {!favourites && (
        <div className="editor-row">
          <label className="text-field">Name of the {group.name} group
            <input value={name} maxLength={VOCABULARY_LIMITS.nameMax} disabled={disabled} onChange={(event) => setName(event.target.value)}
              onBlur={() => { if (name !== group.name && !edit({ kind: 'rename-group', group: group.id, name })) setName(group.name); }} />
          </label>
          {confirmRemove
            ? <button type="button" className="button" disabled={disabled}
                onClick={() => edit({ kind: 'remove-group', group: group.id, force: true })}>Remove {group.name} and its {count} phrase{count === 1 ? '' : 's'}</button>
            : <button type="button" className="button button-quiet" disabled={disabled}
                onClick={() => (count ? setConfirmRemove(true) : edit({ kind: 'remove-group', group: group.id }))}>Remove {group.name} group</button>}
        </div>
      )}
      {favourites && !count && <p className="helper-copy">No favourites yet. Save a message to Favourites from More while communicating, or add one here.</p>}
      <ol className="phrase-edit-list">
        {group.phrases.map((text, index) => (
          <li key={`${index}:${text}`}>
            <PhraseField group={group} index={index} phrase={text} edit={edit} disabled={disabled} />
            <div className="button-row">
              <button type="button" className="button button-quiet" disabled={disabled || index === 0}
                onClick={() => edit({ kind: 'move-phrase', group: group.id, from: index, to: index - 1 })}>Move “{text}” up</button>
              <button type="button" className="button button-quiet" disabled={disabled || index === count - 1}
                onClick={() => edit({ kind: 'move-phrase', group: group.id, from: index, to: index + 1 })}>Move “{text}” down</button>
              <button type="button" className="button button-quiet" disabled={disabled}
                onClick={() => edit({ kind: 'remove-phrase', group: group.id, index })}>Remove “{text}”</button>
            </div>
          </li>
        ))}
      </ol>
      <div className="editor-row">
        <label className="text-field">New phrase for {group.name}
          <input value={phrase} maxLength={VOCABULARY_LIMITS.phraseMax} disabled={disabled || count >= VOCABULARY_LIMITS.phrases}
            onChange={(event) => setPhrase(event.target.value)} />
        </label>
        <button type="button" className="button" disabled={disabled || !phrase.trim() || count >= VOCABULARY_LIMITS.phrases}
          onClick={() => { if (edit({ kind: 'add-phrase', group: group.id, text: phrase })) setPhrase(''); }}>Add to {group.name}</button>
      </div>
    </fieldset>
  );
}

function PhraseField({ group, index, phrase, edit, disabled }: {
  group: PhraseGroup; index: number; phrase: string; edit: (change: VocabularyEdit) => boolean; disabled: boolean;
}) {
  const [draft, setDraft] = useState(phrase);
  return (
    <label className="text-field">{group.name} phrase {index + 1}
      <input value={draft} maxLength={VOCABULARY_LIMITS.phraseMax} disabled={disabled} onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { if (draft !== phrase && !edit({ kind: 'edit-phrase', group: group.id, index, text: draft })) setDraft(phrase); }} />
    </label>
  );
}
