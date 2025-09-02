// Espera al DOM
window.addEventListener('DOMContentLoaded', () => {
  const organizeBtn = document.getElementById('organizeBtn');
  const closeBtn = document.getElementById('closeBtn');
  const componentIdInput = document.getElementById('componentIdInput');
  const selectionInfo = document.getElementById('selectionInfo');
  const selectionText = document.getElementById('selectionText');

  // Escuchar mensajes del plugin ANTES de notificar que estamos listos
  window.addEventListener('message', (event) => {
    const message = event.data.pluginMessage;
    if (message && message.type === 'selection-changed') {
      console.log('Received selection change:', message); // Debug
      
      componentIdInput.value = message.componentSetId;
      
      // Actualizar placeholder y estilos con información útil
      if (message.componentSetId && message.componentSetName) {
        componentIdInput.placeholder = `✅ ${message.componentSetName}`;
        componentIdInput.classList.add('auto-filled');
        
        // Mostrar información de selección
        selectionText.textContent = `Component Set: ${message.componentSetName}`;
        selectionInfo.style.display = 'block';
      } else {
        componentIdInput.placeholder = 'ID del componente set';
        componentIdInput.classList.remove('auto-filled');
        
        // Ocultar información de selección
        selectionInfo.style.display = 'none';
      }
    }
  });

  // Notificar al plugin que la UI está cargada DESPUÉS de configurar el listener
  parent.postMessage({ pluginMessage: { type: 'ui-loaded' } }, '*');

  organizeBtn.addEventListener('click', () => {
    const componentNodeId = document.getElementById('componentIdInput').value.trim();
    const tagComponentId = document.getElementById('tagComponentIdInput').value.trim();

    if (!componentNodeId) {
      alert('⚠️ Debes ingresar el ID del componente set.');
      return;
    }

    parent.postMessage(
      {
        pluginMessage: {
          type: 'organize-component',
          componentNodeId,
          tagComponentId: tagComponentId || null,
          spacing: {
            subGrid: 24,
            groups: 96
          }
        }
      },
      '*'
    );
  });

  closeBtn.addEventListener('click', () => {
    parent.postMessage({ pluginMessage: { type: 'close-plugin' } }, '*');
  });
});