# Migration des Scripts - Ajout du Statut d'Activation

## 📋 Description

Ce script de migration ajoute le champ `isActive` à tous les scripts existants dans la base de données qui n'ont pas encore ce champ. Cette migration est nécessaire suite à l'ajout de la fonctionnalité d'activation/désactivation des scripts.

## 🎯 Objectif

- Ajouter le champ `isActive: true` (par défaut) à tous les scripts existants
- Assurer la compatibilité avec la nouvelle fonctionnalité d'activation/désactivation
- Éviter les erreurs lors de l'affichage des scripts dans l'interface

## 🚀 Comment utiliser

### Option 1: Via npm script (Recommandée)
```bash
cd backend
npm run migrate:scripts-status
```

### Option 2: Directement avec Node.js
```bash
cd backend
node migrate-scripts-status.js
```

## ⚠️ Prérequis

1. **Variables d'environnement** : Assurez-vous que votre fichier `.env` contient :
   ```env
   MONGODB_URI=mongodb://localhost:27017/ai-knowledge
   ```

2. **Base de données accessible** : La base de données MongoDB doit être accessible et en fonctionnement

3. **Sauvegarde recommandée** : Il est recommandé de faire une sauvegarde de votre base de données avant d'exécuter la migration

## 📊 Ce que fait le script

1. **Connexion** : Se connecte à la base de données MongoDB
2. **Recherche** : Trouve tous les scripts sans le champ `isActive`
3. **Mise à jour** : Ajoute `isActive: true` à ces scripts
4. **Vérification** : Vérifie que la migration s'est bien déroulée
5. **Statistiques** : Affiche le résumé des scripts (total, actifs, inactifs)

## 📈 Exemple de sortie

```
🚀 Starting script status migration...
📅 Migration date: 2024-01-15T10:30:00.000Z
🎯 Purpose: Add isActive field to existing scripts
==================================================
🔗 Connecting to MongoDB...
✅ Connected to MongoDB successfully
🔍 Finding scripts without isActive field...
📊 Found 15 scripts without isActive field
🔄 Updating scripts to add isActive: true...
✅ Migration completed successfully!
📈 Updated 15 scripts
📋 Matched 15 scripts
🔍 Verifying migration...
✅ Migration verification successful - all scripts now have isActive field

📊 Final Statistics:
   Total scripts: 15
   Active scripts: 15
   Inactive scripts: 0

🔌 Closing database connection...
✅ Database connection closed

🎉 Migration process completed!
```

## 🔄 Que faire après la migration

1. **Vérifier l'interface** : Connectez-vous à l'interface frontend et vérifiez que tous les scripts apparaissent comme "Actifs"
2. **Tester la fonctionnalité** : Testez l'activation/désactivation de quelques scripts
3. **Utiliser les filtres** : Testez les filtres par statut (Tous, Actifs, Inactifs)

## 🛡️ Sécurité

- Le script est **idempotent** : il peut être exécuté plusieurs fois sans problème
- Seuls les scripts sans le champ `isActive` sont modifiés
- Les scripts déjà migrés ne sont pas touchés

## ❓ Résolution de problèmes

### Erreur de connexion à MongoDB
```bash
❌ Migration failed: MongoNetworkError
```
**Solution** : Vérifiez que MongoDB est en marche et que l'URL de connexion est correcte dans `.env`

### Aucun script trouvé
```bash
✅ All scripts already have the isActive field. No migration needed.
```
**Explication** : Tous les scripts ont déjà été migrés, aucune action nécessaire

### Scripts restants sans statut
```bash
⚠️  Warning: 2 scripts still missing isActive field
```
**Action** : Relancez le script ou vérifiez s'il y a des problèmes de permissions

## 📝 Notes importantes

- **Une seule fois** : Cette migration ne doit être exécutée qu'une seule fois après le déploiement de la nouvelle fonctionnalité
- **Pas de perte de données** : Aucune donnée existante n'est supprimée ou modifiée, seul le champ `isActive` est ajouté
- **Par défaut actifs** : Tous les scripts existants seront marqués comme actifs par défaut

---

**Date de création** : Janvier 2024  
**Auteur** : Équipe de développement AI Knowledge  
**Version** : 1.0 