interface NoProfileStateProps {
  onQuestionnaire: () => void;
  onPersona: () => void;
}

/**
 * Shown instead of the feed when the logged-in account has no investor profile on the server.
 * Without a profile there is nothing suitable to show: no fictional cards, no "Buy".
 */
export function NoProfileState({ onQuestionnaire, onPersona }: NoProfileStateProps) {
  return (
    <div className="empty-state no-profile" role="region" aria-label="Profil manquant">
      <h2>Commençons par votre profil</h2>
      <p className="no-profile__text">
        Ce compte n’a pas encore de profil d’investisseur. Sans objectif, horizon ni tolérance au risque,
        nous ne pouvons pas dire quelles idées vous conviennent.
      </p>
      <button type="button" className="primary-btn" onClick={onQuestionnaire}>
        Répondre au questionnaire
      </button>
      <button type="button" className="link-btn no-profile__alt" onClick={onPersona}>
        Essayer un profil de démonstration (Amira, Mateo, Robert)
      </button>
    </div>
  );
}
