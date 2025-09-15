// ====== AT Protocol & Constants ======
// AtpAgent is loaded via window.AtpAgent from the module import

// Bookmark lexicon definition (using community standard)
const BOOKMARK_LEXICON = "community.lexicon.bookmarks.bookmark";

const LOCAL_GLOW = false; // No local storage differentiation needed
const MAX_CHARS_PER_LINE = 15;
const MAX_LINES = 4;
const EST_CHAR_WIDTH = 0.6; // em
const HYPHENATE_THRESHOLD = 12;
const COLOR_PAIRS = [
	["#D1F257", "#0D0D0D"], ["#F2BBDF", "#D94E41"], ["#010D00", "#33A63B"],
	["#F2E4E4", "#0D0C00"], ["#2561D9", "#F2FDFE"], ["#734c48", "#F2F2EB"],
	["#8FBFAE", "#127357"], ["#3A8C5D", "#F2BFAC"], ["#8AA3A6", "#F2F0E4"],
	["#F2C438", "#F23E2E"], ["#455919", "#F2D338"], ["#F2D8A7", "#F26363"],
	["#260101", "#D93223"], ["#456EBF", "#F2F1E9"], ["#131E40", "#F2A413"],
	["#F2F2F2", "#131E40"], ["#262626", "#F2EDDC"], ["#40593C", "#F2E6D0"],
	["#F2F1DF", "#262416"], ["#F2CB05", "#0D0D0D"], ["#F2F2F2", "#F2CB05"],
	["#F2E6D0", "#261C10"], ["#F2D7D0", "#262523"], ["#F2F0D8", "#F24535"],
	["#191726", "#D9D9D9"], ["#F2E8D5", "#0C06BF"], ["#F2EFE9", "#45BFB3"],
	["#F2C2C2", "#D93644"], ["#734C48", "#F2C2C2"],
];

const FONT_LIST = [
	"Caveat", "Permanent Marker", "Courier", "Doto", "Bree Serif",
	"Ultra", "Alfa Slab One", "Sedan SC", "EB Garamond", "Bebas Neue",
];

// State variables
let atpAgent = null;
let oauthClient = null;
let userDid = null;
let bookmarks = [];
let reversedOrder = false;
let viewingUserDid = null;
let viewingUserHandle = null;
let isViewingOtherUser = false;
let isListView = true;
let currentSearchedUserProfile = null;

// ====== DOM Elements ======
const loginDialog = document.getElementById("loginDialog");
const handleInput = document.getElementById("handleInput");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userAvatar = document.getElementById("userAvatar");
const searchedUserAvatar = document.getElementById("searchedUserAvatar");

const dialog = document.getElementById("paramDialog");
const titleInput = document.getElementById("paramTitle");
const urlInput = document.getElementById("paramUrl");
const tagsInput = document.getElementById("tagsInput");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");
const openEmptyDialogBtn = document.getElementById("openEmptyDialogBtn");
const searchInput = document.getElementById("searchInput");
const sortToggleBtn = document.getElementById("sortToggleBtn");
const viewToggleBtn = document.getElementById("viewToggleBtn");
const userSearchInput = document.getElementById("userSearchInput");
const viewingUser = document.getElementById("viewingUser");
// guestSearchInput removed - using handleInput for both login and guest
const guestViewBtn = document.getElementById("guestViewBtn");

// ====== AT Protocol Functions ======

/**
 * Resolve handle to DID and PDS
 */
async function resolveHandle(handle) {
	if (!atpAgent && !window.AtpAgent) return null;

	try {
		const agent = atpAgent || new window.AtpAgent({
			service: "https://bsky.social",
		});

		// First resolve handle to DID
		const response = await agent.com.atproto.identity.resolveHandle({
			handle: handle.replace('@', '')
		});

		const did = response.data.did;

		// Now resolve DID to get PDS URL
		const didDoc = await fetch(`https://plc.directory/${did}`).then(res => res.json());

		// Find the PDS service endpoint
		let pdsUrl = "https://bsky.social"; // fallback
		if (didDoc.service) {
			const pdsService = didDoc.service.find(s => s.type === "AtprotoPersonalDataServer");
			if (pdsService && pdsService.serviceEndpoint) {
				pdsUrl = pdsService.serviceEndpoint;
			}
		}

		return { did, pdsUrl };
	} catch (error) {
		console.error("Failed to resolve handle:", error);
		return null;
	}
}

/**
 * Get client ID based on environment
 */
function getClientId() {
	const hostname = window.location.hostname;
	if (hostname === 'localhost' || hostname === '127.0.0.1') {
		const port = window.location.port || '8080';
		const params = new URLSearchParams({
			scope: 'atproto transition:generic',
			redirect_uri: `http://127.0.0.1:${port}/`
		});
		return `http://localhost?${params}`;
	}
	return 'https://boomarks.netlify.app/client-metadata.json';
}

/**
 * Initialize OAuth client and check for existing session
 */
async function initializeOAuth() {
	const clientId = getClientId();
	console.log("Initializing OAuth client with ID:", clientId);

	try {
		const hostname = window.location.hostname;
		oauthClient = await window.BrowserOAuthClient.load({
			clientId: clientId,
			handleResolver: 'https://bsky.social',
			allowHttp: hostname === 'localhost' || hostname === '127.0.0.1'
		});
		console.log("OAuth client loaded successfully:", oauthClient);
	} catch (error) {
		console.error("Failed to load OAuth client:", error);
		showLoginDialog();
		return false;
	}

	// Clear any old app password session data that might conflict
	localStorage.removeItem("atproto_session");

	// Use init() to handle both callbacks and session restoration
	try {
		const result = await oauthClient.init();
		if (result) {
			console.log("OAuth init result:", result);
			const session = result.session;
			atpAgent = new window.Agent(session);
			userDid = session.sub;

			// Clear URL parameters if this was a callback
			const urlParams = new URLSearchParams(window.location.search);
			if (urlParams.has('code') || urlParams.has('error')) {
				window.history.replaceState({}, document.title, window.location.pathname);
			}

			await updateUIForLoggedInState();
			await loadBookmarks();
			return true;
		}
	} catch (error) {
		console.error("Failed to initialize OAuth:", error);
	}

	showLoginDialog();
	return false;
}

/**
 * Start OAuth login flow
 */
async function startOAuthLogin() {
	let handle = handleInput.value.trim();
	if (!handle) return;

	// Strip @ prefix if present
	if (handle.startsWith('@')) {
		handle = handle.slice(1);
	}

	console.log("Starting OAuth login for handle:", handle);
	console.log("OAuth client:", oauthClient);

	// If OAuth client is null (e.g., after logout), reinitialize it
	if (!oauthClient) {
		console.log("OAuth client is null, reinitializing...");
		await initializeOAuth();
		if (!oauthClient) {
			throw new Error("Failed to initialize OAuth client");
		}
	}

	try {
		// Use signIn method like the reference implementation
		const session = await oauthClient.signIn(handle, {
			scope: 'atproto transition:generic'
		});

		console.log("Login successful:", session);

		// Set up authenticated agent
		atpAgent = new window.AtpAgent({ service: session.pds });
		await atpAgent.configure({
			service: session.pds,
			accessToken: session.accessToken
		});

		userDid = session.sub;
		loginDialog.close();
		await updateUIForLoggedInState();
		await loadBookmarks();
	} catch (error) {
		console.error("OAuth login failed:", error);
		console.error("Error details:", error.message, error.stack);
		alert(`Failed to login: ${error.message}`);
	}
}

/**
 * Handle OAuth callback after redirect
 */
async function handleOAuthCallback() {
	try {
		const result = await oauthClient.callback(window.location.href);

		// Create authenticated AtpAgent
		atpAgent = new window.AtpAgent({ service: result.pds });
		await atpAgent.configure({
			service: result.pds,
			accessToken: result.accessToken
		});

		userDid = result.sub;

		// Clear URL parameters
		window.history.replaceState({}, document.title, window.location.pathname);

		await updateUIForLoggedInState();
		await loadBookmarks();
		return true;
	} catch (error) {
		console.error("OAuth callback failed:", error);
		alert("Login failed. Please try again.");
		showLoginDialog();
		return false;
	}
}

/**
 * Fetch user profile information
 */
async function fetchUserProfile(did) {
	// Try to use the logged-in agent first, fallback to public agent
	let agent = atpAgent;
	if (!agent) {
		agent = new window.AtpAgent({
			service: "https://bsky.social",
		});
	}

	try {
		const response = await agent.getProfile({ actor: did });
		return response.data;
	} catch (error) {
		console.error("Failed to fetch user profile:", error);
		return null;
	}
}

/**
 * Logout from OAuth session
 */
async function logout() {
	if (oauthClient) {
		try {
			await oauthClient.revoke();
		} catch (error) {
			console.error("Logout error:", error);
		}
	}

	oauthClient = null;
	atpAgent = null;
	userDid = null;
	bookmarks = [];
	isViewingOtherUser = false;
	viewingUserDid = null;
	viewingUserHandle = null;
	
	updateUIForLoggedOutState();
	showLoginDialog();
}

/**
 * Load bookmarks from PDS
 */
async function loadBookmarks(targetDid = null, targetPdsUrl = null) {
	const did = targetDid || userDid;
	if (!did) return;

	// Create agent if needed for public access
	let agent = atpAgent;
	if (!agent || targetPdsUrl) {
		const serviceUrl = targetPdsUrl || "https://bsky.social";
		agent = new window.AtpAgent({
			service: serviceUrl,
		});
	}

	try {
		// First try to describe the repo to see if it exists
		try {
			await agent.com.atproto.repo.describeRepo({
				repo: did,
			});
		} catch (describeError) {
			console.error("Repo describe failed:", describeError);
			bookmarks = [];
			renderBookmarks();
			alert("User has no bookmarks or bookmarks are not accessible");
			return;
		}

		const response = await agent.com.atproto.repo.listRecords({
			repo: did,
			collection: BOOKMARK_LEXICON,
		});

		bookmarks = response.data.records.map(record => ({
			atUri: record.uri,  // AT Protocol record URI
			cid: record.cid,
			...record.value     // Contains subject, title, tags, etc.
		}));

		renderBookmarks();
	} catch (error) {
		console.error("Failed to load bookmarks:", error);
		if (error.message?.includes("Could not find repo") || error.message?.includes("not found") || error.message?.includes("RecordNotFound")) {
			bookmarks = [];
			renderBookmarks();
			alert("User has no bookmarks with this lexicon");
		}
	}
}

/**
 * Save a bookmark to PDS
 */
async function saveBookmark() {
	const title = titleInput.value.trim();
	const url = urlInput.value.trim();
	const rawTags = tagsInput.value.trim();

	if (!url || !atpAgent || !userDid) return;

	const tags = rawTags.split(",").map(t => t.trim()).filter(Boolean);

	const bookmarkRecord = {
		$type: BOOKMARK_LEXICON,
		subject: url,
		tags,
		createdAt: new Date().toISOString(),
	};

	// Add optional title if provided
	if (title) {
		bookmarkRecord.title = title;
	}

	try {
		const response = await atpAgent.com.atproto.repo.createRecord({
			repo: userDid,
			collection: BOOKMARK_LEXICON,
			record: bookmarkRecord,
		});

		// Add to local array
		bookmarks.push({
			atUri: response.data.uri,
			cid: response.data.cid,
			...bookmarkRecord
		});

		renderBookmarks();
		dialog.close();

		// Clear URL params and reload to clean state
		window.history.replaceState({}, document.title, window.location.pathname);
	} catch (error) {
		console.error("Failed to save bookmark:", error);
		alert("Failed to save bookmark. Please try again.");
	}
}

/**
 * Delete a bookmark from PDS
 */
async function deleteBookmark(uri) {
	if (!atpAgent || !userDid) return;

	try {
		console.log("Deleting bookmark with URI:", uri);
		const rkey = uri.split("/").pop();
		console.log("Extracted rkey:", rkey);

		const deleteParams = {
			repo: userDid,
			collection: BOOKMARK_LEXICON,
			rkey,
		};
		console.log("Delete parameters:", deleteParams);

		const result = await atpAgent.com.atproto.repo.deleteRecord(deleteParams);
		console.log("Delete result:", result);

		console.log("Successfully deleted from PDS");

		// Remove from local array
		const beforeCount = bookmarks.length;
		bookmarks = bookmarks.filter(bookmark => bookmark.atUri !== uri);
		console.log(`Removed from local array: ${beforeCount} -> ${bookmarks.length}`);

		renderBookmarks();
	} catch (error) {
		console.error("Failed to delete bookmark:", error);
		alert("Failed to delete bookmark: " + error.message);
	}
}

// ====== UI Functions ======

async function updateUIForLoggedInState() {
	if (!userDid || !atpAgent) return;

	// Fetch and display user avatar
	const profile = await fetchUserProfile(userDid);
	if (profile && profile.avatar) {
		userAvatar.src = profile.avatar;
		userAvatar.style.display = "inline-block";
	} else {
		userAvatar.style.display = "none";
	}

	// Update button to show logout
	logoutBtn.textContent = "Logout";
	logoutBtn.style.display = "inline-block";

	showMainUI();
}

function updateUIForLoggedOutState() {
	// Hide avatar
	userAvatar.style.display = "none";

	// Update button to show login
	logoutBtn.textContent = "Login";
	logoutBtn.style.display = "inline-block";

	showLoginDialog();
}

function showLoginDialog() {
	loginDialog.showModal();
	openEmptyDialogBtn.style.display = "none";
	sortToggleBtn.style.display = "none";
	viewToggleBtn.style.display = "none";
	searchInput.style.display = "none";
}

function showMainUI() {
	openEmptyDialogBtn.style.display = isViewingOtherUser ? "none" : "inline-block";
	sortToggleBtn.style.display = "inline-block";
	viewToggleBtn.style.display = "inline-block";
	searchInput.style.display = "inline-block";
	userSearchInput.style.display = "inline-block";
}

function updateViewingUserUI() {
	if (isViewingOtherUser) {
		// Don't show "Viewing: ..." text anymore
		viewingUser.style.display = "none";
		openEmptyDialogBtn.style.display = "none";
		// Show searched user avatar if we have profile data
		if (currentSearchedUserProfile && currentSearchedUserProfile.avatar) {
			searchedUserAvatar.src = currentSearchedUserProfile.avatar;
			searchedUserAvatar.style.display = "inline-block";
		}
	} else {
		viewingUser.style.display = "none";
		openEmptyDialogBtn.style.display = atpAgent ? "inline-block" : "none";
		searchedUserAvatar.style.display = "none"; // Hide searched user avatar when back to own bookmarks
		currentSearchedUserProfile = null;
	}
}

// ====== Utility Functions ======

/**
 * Hashes a string to a non-negative 32-bit integer.
 */
function hashString(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

/**
 * Get a color pair deterministically by title.
 */
function getColorPairByTitle(title, pairs) {
	const hash = hashString(title);
	const idx = hash % pairs.length;
	const [bg, fg] = pairs[idx];
	return (hash % 2 === 0) ? [bg, fg] : [fg, bg];
}

/**
 * Get a font family deterministically by title.
 */
function getFontByTitle(title, fonts) {
	return fonts[hashString(title) % fonts.length];
}

/**
 * Format date as natural language for recent dates, otherwise as regular date
 */
function formatNaturalDate(dateString) {
	if (!dateString) return '';

	const date = new Date(dateString);
	const now = new Date();
	const diffTime = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

	// If it's within the last month (30 days)
	if (diffDays < 30) {
		if (diffDays === 0) {
			return 'today';
		} else if (diffDays === 1) {
			return 'yesterday';
		} else {
			return `${diffDays} days ago`;
		}
	}

	// For older dates, show the actual date
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

// ====== Rendering Functions ======

/**
 * Renders bookmarks in list view
 */
function renderListView() {
	const containerWrapper = document.querySelector(".containers");
	containerWrapper.innerHTML = "";

	const fragment = document.createDocumentFragment();
	const displayBookmarks = reversedOrder ? bookmarks : [...bookmarks].reverse();

	displayBookmarks.forEach(bookmark => {
		const title = bookmark.title || bookmark.subject;
		const url = bookmark.subject || bookmark.uri;
		const tags = bookmark.tags || [];
		const createdAt = bookmark.createdAt;

		if (!url) return;

		const displayTitle = title.replace(/^https?:\/\/(www\.)?/i, "");

		// Create list item
		const listItem = document.createElement("div");
		listItem.className = "bookmark-item";

		// Content container
		const content = document.createElement("div");
		content.className = "bookmark-content";

		// Link group (title + URL together, but not date)
		const linkGroup = document.createElement("div");
		linkGroup.className = "bookmark-link-group";

		// Title link
		const titleLink = document.createElement("a");
		titleLink.className = "bookmark-title";
		titleLink.href = url;
		titleLink.target = "_blank";
		titleLink.textContent = displayTitle;
		linkGroup.appendChild(titleLink);

		// URL-only container (without date)
		const urlContainer = document.createElement("div");
		urlContainer.className = "bookmark-url-container";

		const urlLink = document.createElement("a");
		urlLink.className = "bookmark-url";
		urlLink.href = url;
		urlLink.target = "_blank";
		urlLink.textContent = url;
		urlLink.style.textDecoration = "none";
		urlLink.style.color = "#666";
		urlContainer.appendChild(urlLink);

		linkGroup.appendChild(urlContainer);
		content.appendChild(linkGroup);

		// Meta row for date and tags (outside hover group)
		const metaRow = document.createElement("div");
		metaRow.className = "bookmark-meta-row";

		// Tags on the left
		if (tags.length > 0) {
			const tagsDiv = document.createElement("div");
			tagsDiv.className = "bookmark-tags";

			tags.forEach(tag => {
				const tagSpan = document.createElement("span");
				tagSpan.className = "bookmark-tag";
				tagSpan.textContent = `#${tag}`;
				tagSpan.addEventListener("click", () => filterByTag(tag));
				tagsDiv.appendChild(tagSpan);
			});

			metaRow.appendChild(tagsDiv);
		}

		// Date on the right
		if (createdAt) {
			const dateDiv = document.createElement("div");
			dateDiv.className = "bookmark-date";
			dateDiv.textContent = formatNaturalDate(createdAt);
			metaRow.appendChild(dateDiv);
		}

		content.appendChild(metaRow);

		listItem.appendChild(content);

		// Actions (delete button)
		if (!isViewingOtherUser) {
			const actions = document.createElement("div");
			actions.className = "bookmark-actions";

			const deleteBtn = document.createElement("button");
			deleteBtn.className = "delete-btn";
			deleteBtn.textContent = "×";
			deleteBtn.title = "Delete this bookmark";
			deleteBtn.addEventListener("click", e => {
				e.stopPropagation();
				e.preventDefault();
				if (confirm("Delete this bookmark?")) {
					deleteBookmark(bookmark.atUri);
				}
			});

			actions.appendChild(deleteBtn);
			listItem.appendChild(actions);
		}

		fragment.appendChild(listItem);
	});

	containerWrapper.appendChild(fragment);
}

/**
 * Renders bookmarks in grid view (original)
 */
function renderGridView() {
	const containerWrapper = document.querySelector(".containers");
	containerWrapper.innerHTML = "";

	const fragment = document.createDocumentFragment();
	const displayBookmarks = reversedOrder ? bookmarks : [...bookmarks].reverse();

	displayBookmarks.forEach(bookmark => {
		const title = bookmark.title || bookmark.subject; // fallback to subject as title if no title
		const url = bookmark.subject || bookmark.uri; // support both old and new schema
		const tags = bookmark.tags || [];

		if (!url) return;

		const displayTitle = title.replace(/^https?:\/\/(www\.)?/i, "");
		const [bgColor, fontColor] = getColorPairByTitle(title, COLOR_PAIRS);
		const fontFamily = getFontByTitle(title, FONT_LIST);

		const container = document.createElement("div");
		container.className = "container";
		container.style.backgroundColor = bgColor;
		container.style.color = fontColor;
		container.style.fontFamily = `'${fontFamily}', sans-serif`;

		// Delete Button (only show for own bookmarks)
		if (!isViewingOtherUser) {
			const closeBtn = document.createElement("button");
			closeBtn.className = "delete-btn";
			closeBtn.textContent = "x";
			closeBtn.title = "Delete this bookmark";
			closeBtn.addEventListener("click", e => {
				e.stopPropagation();
				e.preventDefault();
				if (confirm("Delete this bookmark?")) {
					deleteBookmark(bookmark.atUri);
				}
			});
			container.appendChild(closeBtn);
		}

		// Anchor (bookmark link)
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.target = "_blank";
		anchor.innerHTML = `<span style="font-size: 5vw;"><span>${displayTitle}</span></span>`;
		container.appendChild(anchor);

		// Tags
		if (tags.length > 0) {
			const wrapper = document.createElement("div");
			wrapper.className = "tags-wrapper";

			tags.forEach(tag => {
				const tagDiv = document.createElement("div");
				tagDiv.className = "tags tag-style";
				tagDiv.textContent = `#${tag}`;
				tagDiv.addEventListener("click", () => filterByTag(tag));
				wrapper.appendChild(tagDiv);
			});

			container.appendChild(wrapper);
		}

		fragment.appendChild(container);
	});

	containerWrapper.appendChild(fragment);
	runTextFormatting();
}

/**
 * Renders bookmark containers
 */
function renderBookmarks() {
	// Toggle body class for CSS styling
	document.body.classList.toggle('list-view', isListView);

	if (isListView) {
		renderListView();
	} else {
		renderGridView();
	}
}

/**
 * Filter bookmarks by tag
 */
function filterByTag(tag) {
	searchInput.value = `#${tag}`;
	searchInput.dispatchEvent(new Event("input"));
}

/**
 * Formats text inside containers after rendering
 */
function runTextFormatting() {
	document.querySelectorAll(".container").forEach(container => {
		const anchor = container.querySelector("a");
		if (!anchor) return;

		const originalText = anchor.innerText.trim();
		const href = anchor.href;
		if (!originalText || !href) return;

		anchor.innerHTML = "";

		const formattedText = originalText.replace(/(\s\|\s|\s-\s|\s–\s|\/,)/g, "<hr/>");
		const [firstPart, ...restParts] = formattedText.split("<hr/>");
		const secondPart = restParts.join("<hr/>");

		const span = document.createElement("span");

		let fontSizeVW = 3;
		if (originalText.length < 9) fontSizeVW = 6;
		else if (originalText.length < 20) fontSizeVW = 5;
		else if (originalText.length < 35) fontSizeVW = 4;
		else if (originalText.length < 100) fontSizeVW = 3;
		else fontSizeVW = 2.5;

		span.style.fontSize = `${fontSizeVW}vw`;

		const firstSpan = document.createElement("span");
		firstSpan.innerHTML = firstPart;
		span.appendChild(firstSpan);

		if (restParts.length) {
			const hr = document.createElement("hr");
			hr.classList.add("invisible-hr");

			const secondSpan = document.createElement("span");
			secondSpan.innerHTML = secondPart;
			secondSpan.style.fontSize = `${(fontSizeVW * 2) / 3}vw`;

			span.appendChild(hr);
			span.appendChild(secondSpan);
		}

		anchor.appendChild(span);
	});
}

// ====== Search & Event Handlers ======

/**
 * Debounce utility
 */
function debounce(fn, delay) {
	let timeout;
	return (...args) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => fn(...args), delay);
	};
}

/**
 * Search functionality for bookmarks
 */
function runSearch(term) {
	const searchTerm = term.toLowerCase();

	if (isListView) {
		document.querySelectorAll(".bookmark-item").forEach(item => {
			if (searchTerm.startsWith("#")) {
				const tagToSearch = searchTerm.slice(1);
				const tags = Array.from(item.querySelectorAll(".bookmark-tag"))
					.map(el => el.textContent.toLowerCase().replace("#", "").trim());

				item.style.display = tags.some(tag => tag.includes(tagToSearch)) ? "flex" : "none";
			} else {
				const title = item.querySelector(".bookmark-title")?.textContent.toLowerCase() || "";
				const url = item.querySelector(".bookmark-url")?.textContent.toLowerCase() || "";
				const matches = title.includes(searchTerm) || url.includes(searchTerm);
				item.style.display = matches ? "flex" : "none";
			}
		});
	} else {
		document.querySelectorAll(".container").forEach(container => {
			if (searchTerm.startsWith("#")) {
				const tagToSearch = searchTerm.slice(1);
				const tags = Array.from(container.querySelectorAll(".tags"))
					.map(el => el.textContent.toLowerCase().replace("#", "").trim());

				container.style.display = tags.some(tag => tag.includes(tagToSearch)) ? "block" : "none";
			} else {
				const anchor = container.querySelector("a");
				const title = anchor?.innerText.toLowerCase() || "";
				container.style.display = title.includes(searchTerm) ? "block" : "none";
			}
		});
	}
}

/**
 * Show dialog with URL params if present
 */
function showParamsIfPresent() {
	if (!dialog || !atpAgent) return;

	const params = new URLSearchParams(window.location.search);
	const title = params.get("title");
	const url = params.get("url");

	if (title && url) {
		titleInput.value = title;
		urlInput.value = url;
		dialog.showModal();
	}
}

// ====== Event Listeners ======

// Login/logout
loginBtn.addEventListener("click", startOAuthLogin);

// Submit login on Enter key
handleInput.addEventListener("keypress", (e) => {
	if (e.key === "Enter") {
		startOAuthLogin();
	}
});
logoutBtn.addEventListener("click", () => {
	if (atpAgent) {
		logout();
	} else {
		showLoginDialog();
	}
});

// Guest view functionality
guestViewBtn?.addEventListener("click", async () => {
	const handle = handleInput.value.trim();
	if (!handle) return;

	const result = await resolveHandle(handle);
	if (result) {
		isViewingOtherUser = true;
		viewingUserDid = result.did;
		viewingUserHandle = handle;
		loginDialog.close();
		showMainUI();
		await loadBookmarks(result.did, result.pdsUrl);
		updateViewingUserUI();
	} else {
		alert("User not found");
	}
});

// Dialog
saveBtn.addEventListener("click", saveBookmark);
cancelBtn?.addEventListener("click", () => {
	dialog.close();
	window.history.replaceState({}, document.title, window.location.pathname);
});

// Main UI
openEmptyDialogBtn?.addEventListener("click", () => {
	if (!atpAgent) return;

	titleInput.value = "";
	urlInput.value = "";
	tagsInput.value = "";

	const countInfo = document.getElementById("paramDialogCount");
	countInfo.innerHTML = `${bookmarks.length} bookmarks in PDS`;

	dialog.showModal();
});

// Search
searchInput?.addEventListener(
	"input",
	debounce(e => {
		const searchTerm = e.target.value.trim();
		const params = new URLSearchParams(window.location.search);
		if (searchTerm) params.set("search", searchTerm);
		else params.delete("search");
		history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
		runSearch(searchTerm);
	}, 150)
);

// Sort toggle
sortToggleBtn?.addEventListener("click", () => {
	reversedOrder = !reversedOrder;
	renderBookmarks();

	if (reversedOrder) {
		sortToggleBtn.lastChild.textContent = " ▼";
	} else {
		sortToggleBtn.lastChild.textContent = " ▲";
	}
});

// View toggle
viewToggleBtn?.addEventListener("click", () => {
	isListView = !isListView;
	renderBookmarks();

	if (isListView) {
		viewToggleBtn.innerHTML = '<span class="btn-text">Grid</span> ⊞';
	} else {
		viewToggleBtn.innerHTML = '<span class="btn-text">List</span> ☰';
	}

	// Re-apply current search
	const currentSearch = searchInput.value.trim();
	if (currentSearch) {
		runSearch(currentSearch);
	}
});

// User search
userSearchInput?.addEventListener("keypress", async (e) => {
	if (e.key === "Enter") {
		const handle = e.target.value.trim();
		if (!handle) {
			// Empty search - go back to own bookmarks
			isViewingOtherUser = false;
			viewingUserDid = null;
			viewingUserHandle = null;
			if (userDid) await loadBookmarks();
			updateViewingUserUI();
			return;
		}

		const result = await resolveHandle(handle);
		if (result) {
			isViewingOtherUser = true;
			viewingUserDid = result.did;
			viewingUserHandle = handle;

			// Fetch user profile for avatar
			currentSearchedUserProfile = await fetchUserProfile(result.did);

			await loadBookmarks(result.did, result.pdsUrl);
			updateViewingUserUI();
		} else {
			alert("User not found");
		}
	}
});



// ====== Initialization ======

document.addEventListener("DOMContentLoaded", async () => {
	// Wait for BrowserOAuthClient and AtpAgent to be loaded
	let attempts = 0;
	while ((!window.BrowserOAuthClient || !window.AtpAgent) && attempts < 50) {
		await new Promise(resolve => setTimeout(resolve, 100));
		attempts++;
	}

	if (!window.BrowserOAuthClient || !window.AtpAgent) {
		console.error("Failed to load OAuth client or AtpAgent");
		return;
	}

	const initialized = await initializeOAuth();
	if (initialized) {
		showParamsIfPresent();

		// Restore search from URL
		const initialSearch = new URLSearchParams(window.location.search).get("search");
		if (initialSearch) {
			searchInput.value = initialSearch;
			runSearch(initialSearch);
		}
	}
});
