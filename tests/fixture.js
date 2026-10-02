/* Behavioral regressions run in a real browser against content.js. */
(async () => {
  const api = window.testAPI;
  const results = document.getElementById('results');
  const checks = [];
  const check = (name, condition) => {
    checks.push({name, pass: !!condition});
    if (!condition) throw new Error(name);
  };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const panel = document.getElementById('panel');
  const segments = document.getElementById('segments');
  // A real newline, matching whitespace inside caption markup.
  segments.lastElementChild.querySelector('[role=text]').textContent = ' Meet\n the elephants. ';
  const original = segments.innerHTML;
  try {
    api.scan();
    const action = document.getElementById('ytcopy-actions-btn');
    const copy = panel.querySelector('#ytcopy-copy-btn');
    check('Copy action is outside the native nowrap strip', !action.closest('#top-row') && action.parentElement.previousElementSibling.id === 'top-row');
    const before = action.getBoundingClientRect();
    const closeBefore = panel.querySelector('#visibility-button').getBoundingClientRect();
    const data = api.collectSegments();
    check('Caption whitespace is normalized', data.length === 2 && data[1].text === 'Meet the elephants.');
    check('Paragraph output is clean', api.buildText(data, {}) === 'Hello world. Meet the elephants.');
    check('Caption lines are clean', api.buildText(data, {oneLinePerCaption:true}) === 'Hello world.\nMeet the elephants.');
    check('Timestamps imply lines even when paragraph mode is selected', api.buildText(data, {includeTimestamps:true}) === '0:01 Hello world.\n0:07 Meet the elephants.');
    check('Stats count caption words only', api.transcriptStats(data).words === 5 && api.transcriptStats(data).minutes === 1);
    check('Header excludes hidden rolling-counter digits', api.videoMeta().views === '1,234 views');
    check('Header has a clean title and blank separator', api.buildText(data, {includeHeader:true}).startsWith('Test video\n') && api.buildText(data, {includeHeader:true}).endsWith('\n\nHello world. Meet the elephants.'));
    action.click();
    await pause(30);
    check('Action copies expected text', window.copiedText === 'Hello world. Meet the elephants.');
    check('Action feedback keeps button width', Math.abs(action.getBoundingClientRect().width - before.width) < 0.1);
    api.flash(copy, 'Copied 123,456 words', false);
    check('Panel feedback keeps close button position', Math.abs(panel.querySelector('#visibility-button').getBoundingClientRect().x - closeBefore.x) < 0.1);
    check('Stats feedback is announced', document.querySelector('.ytcopy-toast[role=status]').textContent === 'Copied 123,456 words');
    for (let i=0;i<5;i++) api.scan();
    check('Repeated scans do not duplicate controls', document.querySelectorAll('#ytcopy-actions-btn').length === 1 && panel.querySelectorAll('#ytcopy-copy-btn').length === 1);

    const stale = panel.cloneNode(true);
    stale.id = 'stale-panel';
    stale.setAttribute('target-id', 'PAmodern_transcript_view');
    stale.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
    stale.querySelector('#segments').innerHTML = '<transcript-segment-view-model><span role="text">Wrong stale caption</span></transcript-segment-view-model>';
    document.body.prepend(stale);
    check('Visible transcript wins over a hidden duplicate', api.collectSegments().length === 2 && api.collectSegments()[0].text === 'Hello world.');
    stale.remove();

    const fallback = document.createElement('transcript-segment-view-model');
    fallback.innerHTML = '<div class="ytwTranscriptSegmentViewModelTimestamp">0:07</div><div class="ytwTranscriptSegmentViewModelTimestampA11yLabel">7 seconds</div><p>Say 0:07 twice.</p>';
    check('Fallback preserves spoken timestamp text and removes accessibility labels', api.readSegment(fallback,true).text === 'Say 0:07 twice.');
    // Modern chapter headings become section titles (and never count as words).
    segments.innerHTML =
      '<timeline-chapter-view-model><h3>Chapter 1: Intro</h3></timeline-chapter-view-model>' +
      '<transcript-segment-view-model><div class="ytwTranscriptSegmentViewModelTimestamp">0:01</div><span role="text">Hello there.</span></transcript-segment-view-model>' +
      '<timeline-chapter-view-model><h3>Chapter 2: Outro</h3></timeline-chapter-view-model>' +
      '<transcript-segment-view-model><div class="ytwTranscriptSegmentViewModelTimestamp">0:09</div><span role="text">Goodbye.</span></transcript-segment-view-model>';
    const chaptered = api.collectSegments();
    check('Chapters become section headings', api.buildText(chaptered, {}) === 'Chapter 1: Intro\nHello there.\n\nChapter 2: Outro\nGoodbye.');
    check('Chapters work with timestamps', api.buildText(chaptered, {includeTimestamps:true}) === 'Chapter 1: Intro\n0:01 Hello there.\n\nChapter 2: Outro\n0:09 Goodbye.');
    check('Chapters can be turned off', api.buildText(chaptered, {includeChapters:false}) === 'Hello there. Goodbye.');
    check('Chapter titles are not counted as words', api.transcriptStats(chaptered).words === 3);
    segments.innerHTML = '<timeline-chapter-view-model><h3>Chapter 1: Intro</h3></timeline-chapter-view-model>';
    check('Chapters without captions are not a transcript', api.collectSegments().length === 0);

    segments.innerHTML = '<ytd-transcript-segment-renderer><div class="segment-timestamp">0:12</div><div class="segment-text">Classic\n caption &amp; text.</div></ytd-transcript-segment-renderer>';
    check('Classic layout still copies correctly', api.buildText(api.collectSegments(), {includeTimestamps:true}) === '0:12 Classic caption & text.');

    // Delayed description and incremental caption batches, with simultaneous callers.
    segments.innerHTML = '';
    let expands = 0;
    let opens = 0;
    const expand = document.getElementById('expand');
    const section = document.createElement('ytd-video-description-transcript-section-renderer');
    const show = document.createElement('button');
    show.textContent = 'Show transcript';
    section.appendChild(show);
    expand.onclick = () => { expands++; setTimeout(() => document.getElementById('description').appendChild(section), 100); };
    show.onclick = () => {
      opens++;
      segments.innerHTML = original;
      setTimeout(() => { const extra = segments.firstElementChild.cloneNode(true); extra.querySelector('[role=text]').textContent = 'Final batch.'; segments.appendChild(extra); }, 200);
    };
    const [loaded, shared] = await Promise.all([api.ensureTranscriptAndCollect(), api.ensureTranscriptAndCollect()]);
    check('Delayed description and caption batches finish before copying', loaded.length === 3 && loaded[2].text === 'Final batch.');
    check('Concurrent requests expand and open only once', expands === 1 && opens === 1 && shared.length === 3);
    section.remove();
    expand.onclick = null;

    segments.innerHTML = '';
    const navigating = api.handleCopyRequest(false);
    document.dispatchEvent(new Event('yt-navigate-start'));
    document.dispatchEvent(new Event('yt-navigate-finish'));
    const aborted = await navigating;
    check('Navigation cancels a pending copy', !aborted.ok && aborted.reason === 'navigated');

    // A video without an opener must not recurse into our own Copy button.
    const unavailable = await api.handleCopyRequest(false);
    check('No-transcript request ends without recursive copy', !unavailable.ok && unavailable.reason === 'no-transcript');
    segments.innerHTML = original;

    // Exercise the browser fallback while a control has focus.
    const clipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async()=>{throw new Error('blocked');}}});
    const exec = document.execCommand;
    document.execCommand = () => true;
    action.focus({preventScroll:true});
    const scrollBefore = window.scrollY;
    await api.writeClipboard('fallback');
    check('Clipboard fallback restores focus without scrolling', document.activeElement === action && window.scrollY === scrollBefore && !document.querySelector('textarea'));
    document.execCommand = exec;
    Object.defineProperty(navigator, 'clipboard', {configurable:true,value:clipboard});

    // The transcript search box filters captions, so a non-empty query is flagged.
    const search = document.createElement('input');
    panel.appendChild(search);
    check('Empty transcript search is not treated as a filter', !api.searchActive(panel));
    search.value = 'elephants';
    check('Typed transcript search is flagged as a filter', api.searchActive(panel));
    search.remove();
    const modernSearch = document.createElement('textarea');
    modernSearch.value = 'fan';
    panel.appendChild(modernSearch);
    check('Modern textarea search is flagged as a filter', api.searchActive(panel));
    modernSearch.remove();

    // Popup/hotkey re-inject the script into tabs opened before install or update.
    await new Promise((resolve) => {
      const again = document.createElement('script');
      again.src = '/test-content.js?reinjected';
      again.onload = resolve;
      document.body.appendChild(again);
    });
    api.scan();
    check('Re-injected script does not duplicate controls', document.querySelectorAll('#ytcopy-actions-btn').length === 1 && panel.querySelectorAll('#ytcopy-copy-btn').length === 1);

    // Captions can render before YouTube stamps the panel header.
    const late = document.createElement('ytd-engagement-panel-section-list-renderer');
    late.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
    late.innerHTML = '<div><transcript-segment-view-model><span role="text">Late header.</span></transcript-segment-view-model></div>';
    document.querySelector('main').appendChild(late);
    api.scan();
    check('Before the header exists the button uses the fallback toolbar', !!late.querySelector('.ytcopy-panel-toolbar #ytcopy-copy-btn'));
    late.insertAdjacentHTML('afterbegin', '<ytd-engagement-panel-title-header-renderer><div id="header"><div id="title-container">Transcript</div><div id="visibility-button"><button class="native" aria-label="Close">x</button></div></div></ytd-engagement-panel-title-header-renderer>');
    api.scan();
    const moved = late.querySelector('#ytcopy-copy-btn');
    check('Button moves beside the close button once the header appears', !!moved && moved.nextElementSibling && moved.nextElementSibling.id === 'visibility-button' && !late.querySelector('.ytcopy-panel-toolbar'));
    late.remove();
    api.scan();
    window.testResults = {passed:checks.length, failed:0, checks};
  } catch (error) {
    window.testResults = {passed:checks.filter(c=>c.pass).length,failed:1,checks,error:String(error)};
  }
  results.textContent = `${window.testResults.passed} passed, ${window.testResults.failed} failed\n` + checks.map(c=>(c.pass?'PASS ':'FAIL ')+c.name).join('\n') + (window.testResults.error ? '\n'+window.testResults.error : '');
})();
