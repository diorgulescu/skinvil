// SPDX-License-Identifier: GPL-3.0-only
import gplLicenseText from '../../LICENSE?raw';
import type { I18nStore } from '../i18n/translations';
import { APP_ICON_URL } from './icons';

/**
 * 100% offline "About & GNU GPLv3 License" dialog fulfilling GNU GPLv3 Section 0 & Section 5(d)
 * Appropriate Legal Notices (copyright notice, absence of warranty, conveyance rights, and
 * full verbatim copy of the GNU General Public License v3.0).
 */
export class AboutModal {
  public readonly root: HTMLElement;
  private readonly i18n: I18nStore;

  private titleEl!: HTMLElement;
  private closeBtn!: HTMLButtonElement;
  private freeSoftwareEl!: HTMLElement;
  private warrantyEl!: HTMLElement;
  private disclaimerEl!: HTMLElement;

  constructor(i18n: I18nStore) {
    this.i18n = i18n;
    this.root = document.createElement('div');
    this.root.className = 'wardrobe-backdrop about-backdrop hidden';
    this.buildDOM();

    this.i18n.subscribe(() => this.updateLabels());
    this.updateLabels();
  }

  public get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  public open(): void {
    this.updateLabels();
    this.root.classList.remove('hidden');
  }

  public close(): void {
    this.root.classList.add('hidden');
  }

  private buildDOM(): void {
    const dialog = document.createElement('div');
    dialog.className = 'wardrobe-dialog about-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.addEventListener('click', (e) => e.stopPropagation());

    this.root.addEventListener('click', () => this.close());

    const header = document.createElement('div');
    header.className = 'wardrobe-header';

    const identity = document.createElement('div');
    identity.className = 'wardrobe-header-identity';

    const logo = document.createElement('img');
    logo.className = 'wardrobe-brand-logo';
    logo.src = APP_ICON_URL;
    logo.alt = 'Skinvil';
    logo.draggable = false;

    const titleWrap = document.createElement('div');
    this.titleEl = document.createElement('h2');
    this.titleEl.className = 'wardrobe-title';

    const copyrightSub = document.createElement('p');
    copyrightSub.className = 'wardrobe-subtitle';
    copyrightSub.textContent = 'Skinvil v0.1.0 • Copyright (C) 2026 Skinvil Contributors';

    titleWrap.append(this.titleEl, copyrightSub);
    identity.append(logo, titleWrap);

    this.closeBtn = document.createElement('button');
    this.closeBtn.type = 'button';
    this.closeBtn.className = 'block-btn';
    this.closeBtn.addEventListener('click', () => this.close());

    header.append(identity, this.closeBtn);

    const body = document.createElement('div');
    body.className = 'about-modal-body';

    const summaryCard = document.createElement('div');
    summaryCard.className = 'about-legal-summary';

    this.freeSoftwareEl = document.createElement('p');
    this.freeSoftwareEl.className = 'about-legal-para';

    this.warrantyEl = document.createElement('p');
    this.warrantyEl.className = 'about-legal-para about-warranty-para';

    this.disclaimerEl = document.createElement('p');
    this.disclaimerEl.className = 'about-legal-para about-mc-disclaimer';

    summaryCard.append(this.freeSoftwareEl, this.warrantyEl, this.disclaimerEl);

    const licenseBox = document.createElement('pre');
    licenseBox.className = 'about-license-text';
    licenseBox.textContent = gplLicenseText;

    body.append(summaryCard, licenseBox);
    dialog.append(header, body);
    this.root.appendChild(dialog);
  }

  private updateLabels(): void {
    const t = this.i18n.t;
    this.titleEl.textContent = t.aboutModalTitle;
    this.closeBtn.textContent = t.closeBtn;
    this.freeSoftwareEl.textContent = t.aboutFreeSoftwareNotice;
    this.warrantyEl.textContent = t.aboutNoWarrantyNotice;
    this.disclaimerEl.textContent = t.aboutMinecraftDisclaimer;
  }
}
