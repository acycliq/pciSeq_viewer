/**
 * Color scheme selector
 * 
 * To switch color schemes:
 *   Change line 19 below to:
 *   const CLASS_COLOURS = classColorsCodes_allen();      // For Allen Institute data
 *   const CLASS_COLOURS = classColorsCodes_hippocampus(); // For hippocampus data
 *   const CLASS_COLOURS = classColorsCodes_zeisel();     // For Zeisel data (current)
 * 
 * To add new color scheme:
 *   1. Create colorSchemes/myscheme.js
 *   2. Add to index.html: <script src="config/colorSchemes/myscheme.js"></script>
 *   3. Change line 19 below to: const CLASS_COLOURS = classColorsCodes_myscheme();
 * 
 * The entire app will automatically use the selected color scheme.
 */

// Change this line to switch color schemes
const CLASS_COLOURS = classColorsCodes_zeisel();

// Make it available globally (this is what the app uses)
window.classColorsCodes = () => CLASS_COLOURS;