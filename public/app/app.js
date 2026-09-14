(function () {
  'use strict';

  const state = {
    rootFolderId: null,
    currentFolderId: null,
    pathStack: [],
    pickerApiLoaded: false,
    pickerConfig: null,
  };

  const elz = {
    userEmail: document.getElementById('user-email'),
    connectBanner: document.getElementById('connect-banner'),
    connectBtn: document.getElementById('connect-btn'),
    connectBtnToolbar: document.getElementById('connect-btn-toolbar'),
    breadcrumb: document.getElementById('breadcrumb'),
    fileList: document.getElementById('file-list'),
    statusMsg: document.getElementById('status-msg'),
    newFolderBtn: document.getElementById('new-folder-btn'),
    fileInput: document.getElementById('file-input'),
  };

  function showStatus(text, isError) {
    elz.statusMsg.textContent = text;
    elz.statusMsg.hidden = !text;
    elz.statusMsg.className = 'status' + (isError ? ' error' : '');
  }

  async function checkSession() {
    const res = await fetch('/.netlify/functions/session');
    const data = await res.json();
    if (!data.loggedIn) {
      window.location.href = '/';
      return null;
    }
    elz.userEmail.textContent = data.email;
    return data;
  }

  async function loadPickerConfig() {
    const res = await fetch('/.netlify/functions/picker-config');
    if (!res.ok) throw new Error('Could not load picker config.');
    state.pickerConfig = await res.json();
    state.rootFolderId = state.pickerConfig.rootFolderId || null;
  }

  function loadGooglePicker() {
    return new Promise((resolve) => {
      if (state.pickerApiLoaded) return resolve();
      gapi.load('picker', () => {
        state.pickerApiLoaded = true;
        resolve();
      });
    });
  }

  async function openPicker() {
    await loadGooglePicker();
    const cfg = state.pickerConfig;
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setIncludeFolders(true);
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(cfg.accessToken)
      .setDeveloperKey(cfg.apiKey)
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const folder = data.docs[0];
          state.rootFolderId = folder.id;
          elz.connectBanner.hidden = true;
          navigateTo(folder.id, folder.name, true);
        }
      })
      .build();
    picker.setVisible(true);
  }

  function renderBreadcrumb() {
    elz.breadcrumb.innerHTML = '';
    state.pathStack.forEach((step, i) => {
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = step.name;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        state.pathStack = state.pathStack.slice(0, i + 1);
        loadFolder(step.id);
      });
      elz.breadcrumb.appendChild(a);
      if (i < state.pathStack.length - 1) {
        elz.breadcrumb.appendChild(document.createTextNode(' / '));
      }
    });
  }

  function iconFor(mimeType) {
    return mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄';
  }

  function renderFiles(files) {
    elz.fileList.innerHTML = '';
    if (!files.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="3" class="empty">Nothing here yet.</td>';
      elz.fileList.appendChild(tr);
      return;
    }
    files.forEach((f) => {
      const tr = document.createElement('tr');
      const isFolder = f.mimeType === 'application/vnd.google-apps.folder';

      const nameTd = document.createElement('td');
      const nameLink = document.createElement('a');
      nameLink.href = '#';
      nameLink.textContent = iconFor(f.mimeType) + ' ' + f.name;
      nameLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (isFolder) {
          navigateTo(f.id, f.name, false);
        } else {
          window.open(f.webViewLink, '_blank');
        }
      });
      nameTd.appendChild(nameLink);

      const modTd = document.createElement('td');
      modTd.textContent = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : '';

      const linkTd = document.createElement('td');
      if (f.webViewLink) {
        const openLink = document.createElement('a');
        openLink.href = f.webViewLink;
        openLink.target = '_blank';
        openLink.textContent = 'Open in Drive';
        linkTd.appendChild(openLink);
      }

      tr.appendChild(nameTd);
      tr.appendChild(modTd);
      tr.appendChild(linkTd);
      elz.fileList.appendChild(tr);
    });
  }

  async function loadFolder(folderId) {
    showStatus('Loading…', false);
    try {
      const res = await fetch('/.netlify/functions/drive-list?folderId=' + encodeURIComponent(folderId));
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 502 || res.status === 400) {
          elz.connectBanner.hidden = false;
        }
        showStatus(data.error || 'Could not load this folder.', true);
        renderFiles([]);
        return;
      }
      showStatus('', false);
      elz.connectBanner.hidden = true;
      renderFiles(data.files || []);
    } catch (err) {
      showStatus('Network error loading folder.', true);
    }
  }

  function navigateTo(id, name, resetStack) {
    state.currentFolderId = id;
    if (resetStack || !state.pathStack.length) {
      state.pathStack = [{ id: id, name: name }];
    } else {
      state.pathStack.push({ id: id, name: name });
    }
    renderBreadcrumb();
    loadFolder(id);
  }

  async function createFolder() {
    const name = window.prompt('New folder name:');
    if (!name) return;
    showStatus('Creating folder…', false);
    try {
      const res = await fetch('/.netlify/functions/drive-create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: state.currentFolderId, name: name }),
      });
      const data = await res.json();
      if (!res.ok) {
        showStatus(data.error || 'Could not create folder.', true);
        return;
      }
      showStatus('', false);
      loadFolder(state.currentFolderId);
    } catch (err) {
      showStatus('Network error creating folder.', true);
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadFile(file) {
    if (file.size > 4.5 * 1024 * 1024) {
      showStatus('That file is over 4.5MB. Large files need to be uploaded directly in Google Drive for now.', true);
      return;
    }
    showStatus('Uploading ' + file.name + '…', false);
    try {
      const base64Data = await fileToBase64(file);
      const res = await fetch('/.netlify/functions/drive-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: state.currentFolderId,
          filename: file.name,
          mimeType: file.type,
          base64Data: base64Data,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showStatus(data.error || 'Upload failed.', true);
        return;
      }
      showStatus('', false);
      loadFolder(state.currentFolderId);
    } catch (err) {
      showStatus('Network error uploading file.', true);
    }
  }

  async function init() {
    const session = await checkSession();
    if (!session) return;

    await loadPickerConfig();

    elz.connectBtn.addEventListener('click', openPicker);
    elz.connectBtnToolbar.addEventListener('click', openPicker);
    elz.newFolderBtn.addEventListener('click', createFolder);
    elz.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) uploadFile(file);
      elz.fileInput.value = '';
    });

    if (!state.rootFolderId) {
      elz.connectBanner.hidden = false;
      showStatus('Connect your Drive folder to get started.', false);
      return;
    }

    navigateTo(state.rootFolderId, 'MarkIt Database', true);
  }

  init();
})();
