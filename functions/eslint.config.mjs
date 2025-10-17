import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  {
    files: ['src/**/*.ts'],
    ignores: ['lib/**'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended
    ],
    languageOptions: {
      globals: globals.node
    }
  }
])
