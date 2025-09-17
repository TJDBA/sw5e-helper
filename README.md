# SW5E Helper - Intelligent Roll Handling for Foundry VTT

A Foundry VTT module that provides intelligent, automated roll handling for the SW5E (Star Wars 5E) game system, designed specifically for Foundry V11.

## 🎯 Purpose

The SW5E Helper module transforms basic dice rolling into intelligent, context-aware actions that automatically handle complex game mechanics, reduce manual calculations, and provide a seamless gaming experience for both players and GMs.

## ✨ Key Features

### 🗡️ Intelligent Attack System
- **Smart Weapon Detection**: Automatically detects equipped weapons and their properties
- **Dynamic Ability Selection**: Intelligently chooses STR/DEX based on weapon type (ranged, finesse, etc.)
- **Advantage/Disadvantage Handling**: Built-in support for advantage/disadvantage with visual feedback
- **Critical Hit Detection**: Automatic critical hit detection with configurable thresholds
- **Save-Only Attacks**: Support for abilities that don't require attack rolls

### 💥 Advanced Damage System
- **Multi-Damage Type Support**: Handles kinetic, energy, ion, acid, cold, fire, force, lightning, necrotic, poison, psychic, sonic, and true damage types
- **Critical Damage Calculation**: Automatically doubles dice for critical hits
- **Brutal Critical Support**: Configurable brutal critical dice
- **Damage Optimization**: Built-in minimum die thresholds for consistent damage
- **Damage Advantage/Disadvantage**: Optional damage dice advantage/disadvantage

### 🎲 Enhanced Dice Rolling
- **Dice3D Integration**: Beautiful 3D dice animations with damage type color coding
- **Formula Validation**: Smart validation of attack modifiers and damage formulas
- **Separate vs. Shared Rolls**: Choose between individual target rolls or shared group rolls
- **Automatic Modifier Calculation**: Handles proficiency, ability modifiers, and item bonuses

### 🎭 Feature Pack System
- **Combat Superiority**: Support for Battle Master maneuvers and superiority dice
- **Force Empowered Strikes**: Force-based damage modifications
- **Aura of Hatred**: Specialized combat features
- **Extensible Architecture**: Easy to add new feature packs

### 🎮 User Experience
- **Intuitive Dialogs**: Clean, user-friendly attack and damage dialogs
- **Smart Presets**: Remembers last used settings per actor
- **Keyboard Shortcuts**: Quick access via customizable keybindings
- **Target Management**: Easy token targeting with visual feedback
- **Chat Card System**: Rich, interactive chat cards for all rolls

## 🚀 Getting Started

### Installation
1. Install the module in Foundry VTT
2. Ensure you have the SW5E system installed
3. Activate the module in your world

### Basic Usage
1. **Attack Roll**: Select a token and press `Ctrl+Shift+A` (or use the dialog)
2. **Damage Roll**: Select a token and press `Ctrl+Shift+D` (or use the dialog)
3. **Target Selection**: Click on tokens to target them before rolling

### Advanced Features
- **Smart Weapons**: Enable smart weapon mode for automatic ability selection
- **Custom Modifiers**: Add custom attack or damage modifiers
- **Feature Packs**: Enable specialized features based on your character's abilities

## 🏗️ Architecture

The module is built with a modular, extensible architecture:

- **Core Engine**: Handles the fundamental roll mechanics
- **Adapter Layer**: Provides SW5E system integration
- **Pack System**: Extensible feature system for class abilities
- **UI Layer**: Modern, responsive user interfaces
- **Chat System**: Rich, interactive chat cards

## 🔧 Configuration

### Module Settings
- Debug logging options
- Dice3D integration settings
- Default behavior preferences

### Keybindings
- `Ctrl+Shift+A`: Open Attack Dialog
- `Ctrl+Shift+D`: Open Damage Dialog

## 🎨 Customization

### Adding New Feature Packs
The module supports custom feature packs that can:
- Add new UI elements to dialogs
- Modify attack and damage calculations
- Provide custom validation rules
- Handle resource consumption

### Styling
Custom CSS classes for consistent theming across all components.

## 🐛 Troubleshooting

### Common Issues
- **No Weapons Found**: Ensure your character has equipped weapons
- **Template Errors**: Check that all module files are properly installed
- **Dice3D Issues**: Verify Dice3D module is installed and enabled

### Debug Mode
Enable debug logging in module settings for detailed console output.

## 🤝 Contributing

This module is designed to be extensible. To contribute:
1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Submit a pull request

## 📄 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- Built for the SW5E community
- Designed for Foundry VTT V11
- Integrates with Dice3D for enhanced visual experience

---

**SW5E Helper** - Making Star Wars 5E combat faster, smarter, and more engaging in Foundry VTT.
 
