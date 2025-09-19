// Settings window JavaScript
let originalSettings = {};

// DOM elements
const outputDirectoryInput = document.getElementById('outputDirectory');
const browseButton = document.getElementById('browseButton');
const openButton = document.getElementById('openButton');
const internalNetworkModeCheckbox = document.getElementById('internalNetworkMode');
const saveButton = document.getElementById('saveButton');
const cancelButton = document.getElementById('cancelButton');
const statusMessage = document.getElementById('statusMessage');

// Load current settings
async function loadSettings() {
    try {
        const config = await window.electronAPI.getConfig();

        originalSettings = {
            outputDirectory: config.outputDirectory,
            internalNetworkMode: config.internalNetworkMode
        };

        // Update UI
        outputDirectoryInput.value = config.outputDirectory;
        internalNetworkModeCheckbox.checked = config.internalNetworkMode;

        console.log('Settings loaded:', originalSettings);
    } catch (error) {
        console.error('Failed to load settings:', error);
        showStatus('Failed to load settings', 'error');
    }
}

// Save settings
async function saveSettings() {
    try {
        const newSettings = {
            outputDirectory: outputDirectoryInput.value,
            internalNetworkMode: internalNetworkModeCheckbox.checked
        };

        // Save output directory setting
        await window.electronAPI.setConfig('outputDirectory', newSettings.outputDirectory);

        // Handle intranet mode toggle separately
        if (originalSettings.internalNetworkMode !== newSettings.internalNetworkMode) {
            console.log('Toggling intranet mode:', newSettings.internalNetworkMode);
            const result = await window.electronAPI.toggleIntranetMode(newSettings.internalNetworkMode);

            if (!result.success) {
                throw new Error(result.error || 'Failed to toggle intranet mode');
            }
        }

        originalSettings = { ...newSettings };

        showStatus('Settings saved successfully', 'success');

        // Close window after a short delay
        setTimeout(() => {
            window.close();
        }, 1000);

    } catch (error) {
        console.error('Failed to save settings:', error);
        showStatus('Failed to save settings', 'error');
    }
}

// Check if settings have changed
function hasChanges() {
    return (
        outputDirectoryInput.value !== originalSettings.outputDirectory ||
        internalNetworkModeCheckbox.checked !== originalSettings.internalNetworkMode
    );
}

// Update save button state
function updateSaveButton() {
    saveButton.disabled = !hasChanges();
}

// Show status message
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    statusMessage.style.display = 'block';

    if (type === 'success') {
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    }
}

// Event listeners
browseButton.addEventListener('click', async () => {
    try {
        const selectedPath = await window.electronAPI.selectDirectory();
        if (selectedPath) {
            outputDirectoryInput.value = selectedPath;
            updateSaveButton();
        }
    } catch (error) {
        console.error('Failed to select directory:', error);
        showStatus('Failed to select directory', 'error');
    }
});

openButton.addEventListener('click', async () => {
    try {
        const currentPath = outputDirectoryInput.value;
        if (currentPath) {
            await window.electronAPI.openDirectory(currentPath);
        }
    } catch (error) {
        console.error('Failed to open directory:', error);
        showStatus('Failed to open directory', 'error');
    }
});

internalNetworkModeCheckbox.addEventListener('change', updateSaveButton);

saveButton.addEventListener('click', saveSettings);

cancelButton.addEventListener('click', () => {
    window.close();
});

// Handle window close
// Removed confirmation dialog - window can close directly

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        window.close();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        if (!saveButton.disabled) {
            saveButton.click();
        }
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    updateSaveButton();
});