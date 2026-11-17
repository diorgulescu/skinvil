// SPDX-License-Identifier: GPL-3.0-only
/*
 * Skinvil — Kid-friendly 100% offline 3D voxel character skin creator & .mcpack studio
 * Copyright (C) 2026 Skinvil Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of version 3 of the GNU General Public License as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program (see LICENSE). If not, see <https://www.gnu.org/licenses/>.
 */
import './styles/main.css';
import { SkinvilApp } from './ui/appShell';

const appRoot = document.getElementById('app');
if (!appRoot) {
  throw new Error('Missing #app mount container');
}

new SkinvilApp(appRoot);
