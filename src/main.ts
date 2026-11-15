// SPDX-License-Identifier: GPL-3.0-only
import './styles/main.css';
import { SkinvilApp } from './ui/appShell';

const appRoot = document.getElementById('app');
if (!appRoot) {
  throw new Error('Missing #app mount container');
}

new SkinvilApp(appRoot);
