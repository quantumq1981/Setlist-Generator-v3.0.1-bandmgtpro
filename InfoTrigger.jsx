function InfoTrigger({ featureKey, onClick, label }) {
  const handleClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick(featureKey);
  };

  return (
    <button
      type="button"
      className="info-trigger"
      onClick={handleClick}
      aria-label={label || `Learn more about ${featureKey}`}
      title="More info"
    >
      i
    </button>
  );
}

window.InfoTrigger = InfoTrigger;
