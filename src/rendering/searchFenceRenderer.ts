import { MarkdownPostProcessorContext, setIcon } from "obsidian"
import { createProxy, IJiraIssueAccountSettings, IJiraSearchResults } from "../client/jiraInterfaces"
import { JiraClient } from "../client/jiraClient"
import { ObjectsCache } from "../objectsCache"
import { renderTableColumn } from "./renderTableColumns"
import { ESearchColumnsTypes, ESearchResultsRenderingTypes, SearchView, SEARCH_COLUMNS_DESCRIPTION } from "../searchView"
import { SettingsData } from "../settings"
import { RenderingCommon as RC } from "./renderingCommon"


function renderSearchResults(rootEl: HTMLElement, searchView: SearchView, searchResults: IJiraSearchResults): void {
    searchView.account = searchResults.account
    if (searchView.type === ESearchResultsRenderingTypes.LIST) {
        renderSearchResultsList(rootEl, searchResults)
    } else {
        renderSearchResultsTable(rootEl, searchView, searchResults)
    }
}


function renderSearchResultsTable(rootEl: HTMLElement, searchView: SearchView, searchResults: IJiraSearchResults): void {
    const table = createEl('table', { cls: `table is-bordered is-striped is-narrow is-hoverable is-fullwidth ${RC.getTheme()}` })
    renderSearchResultsTableHeader(table, searchView)
    renderSearchResultsTableBody(table, searchView, searchResults)

    const footer = renderSearchFooter(rootEl, searchView, searchResults)
    rootEl.replaceChildren(RC.renderContainer([table, footer]))
}

function renderSearchResultsTableHeader(table: HTMLElement, searchView: SearchView): void {
    const header = createEl('tr', {
        parent:
            createEl('thead', { attr: { style: getAccountBandStyle(searchView.account) }, parent: table })
    })
    const columns = searchView.columns.length > 0 ? searchView.columns : SettingsData.searchColumns
    for (const column of columns) {
        let name = SEARCH_COLUMNS_DESCRIPTION[column.type]
        // Frontmatter
        if (column.type === ESearchColumnsTypes.NOTES && column.extra) {
            name = column.extra
        }
        // Custom field
        if (column.type === ESearchColumnsTypes.CUSTOM_FIELD) {
            name = SettingsData.cache.customFieldsIdToName[column.extra]
        }
        if (column.compact) {
            createEl('th', { text: name[0].toUpperCase(), attr: { 'aria-label-position': 'top', 'aria-label': column.type }, parent: header })
        } else {
            createEl('th', { text: name, title: column.type, parent: header })
        }
    }
}

function renderSearchResultsTableBody(table: HTMLElement, searchView: SearchView, searchResults: IJiraSearchResults): void {
    const tbody = createEl('tbody', { parent: table })
    for (let issue of searchResults.issues) {
        issue = createProxy(issue)
        const row = createEl('tr', { parent: tbody })
        const columns = searchView.columns.length > 0 ? searchView.columns : SettingsData.searchColumns
        renderTableColumn(columns, issue, row)
    }
}

function renderSearchResultsList(rootEl: HTMLElement, searchResults: IJiraSearchResults): void {
    const list: HTMLElement[] = []
    for (const issue of searchResults.issues) {
        list.push(RC.renderIssue(issue))
    }
    rootEl.replaceChildren(RC.renderContainer(list))
}

function getAccountBandStyle(account: IJiraIssueAccountSettings): string {
    if (SettingsData.showColorBand) {
        return 'border-left: 3px solid ' + account.color
    }
    return ''
}

function renderSearchFooter(rootEl: HTMLElement, searchView: SearchView, searchResults: IJiraSearchResults): HTMLElement {
    const searchFooter = createDiv({ cls: 'search-footer' })
    createDiv({
        text: `Total results: ${searchResults.total.toString()} - ${searchResults.account.alias}`,
        parent: searchFooter,
    })
    const lastUpdateContainer = createDiv({ parent: searchFooter })
    createSpan({
        text: `Last update: ${ObjectsCache.getTime(searchView.getCacheKey())}`,
        parent: lastUpdateContainer,
    })
    const refreshButton = createEl('button', { parent: lastUpdateContainer, title: 'Refresh' })
    setIcon(refreshButton, 'sync-small')
    refreshButton.on('click', '.search-footer>button', () => {
        rootEl.empty()
        ObjectsCache.delete(searchView.getCacheKey())
        SearchFenceRenderer(searchView.toRawString(), rootEl, null)
    })
    return searchFooter
}

export const SearchFenceRenderer = async (source: string, rootEl: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> => {
    // console.log(`Search query: ${source}`)
    try {
        const searchView = new SearchView().fromString(source)

        const cachedSearchResults = ObjectsCache.get(searchView.getCacheKey())
        if (cachedSearchResults) {
            if (cachedSearchResults.isError) {
                RC.renderSearchError(rootEl, cachedSearchResults.data as string, searchView)
            } else {
                renderSearchResults(rootEl, searchView, cachedSearchResults.data as IJiraSearchResults)
            }
        } else {
            // console.log(`Search results not available in the cache`)
            RC.renderLoadingItem('Loading...')
            JiraClient.getSearchResults(searchView.query, parseInt(searchView.limit) || SettingsData.searchResultsLimit)
                .then(newSearchResults => {
                    const searchResults = ObjectsCache.add(searchView.getCacheKey(), newSearchResults).data as IJiraSearchResults
                    renderSearchResults(rootEl, searchView, searchResults)
                }).catch(err => {
                    ObjectsCache.add(searchView.getCacheKey(), err, true)
                    RC.renderSearchError(rootEl, err, searchView)
                })
        }
    } catch (err) {
        RC.renderSearchError(rootEl, err, null)
    }
}

