// Inicializácia widgetov po načítaní stránky
window.addEventListener('load', () => {
    // Kontrola, či widget skript načítal ApiSportsWidget objekt
    if ((window as any).ApiSportsWidget) {
      (window as any).ApiSportsWidget.init();
      console.log('API Football widgets initialized!');
    } else {
      console.warn('API Football widget script not loaded yet.');
    }
  });
  