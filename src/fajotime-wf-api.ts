let atomic = require('atomicjs');


// ********************************************************************************************************** Log levels

let g_logError = false;
let g_logWarn = false;
let g_logTrace = false;
let g_logDebug = false;


// *************************************************************************************************************** Tools

function setCookie(name: string, value: any) {
    Cookies.set(name, value, { expires: 365, secure: true});
}

function getCookie(name: string): any {
    // Attention, si l'utiliseur change, des données peuvent être exposées.
    return Cookies.get(name);
}


// **************************************************************************************************************** Init

let g_onLogOut: (() => void) | undefined;
let g_ws_url: string;
let g_cookiesPrefix: string | undefined;
let g_useCookies: boolean = false;

export interface Params_initialize {
    /*
     Call when must log out user.
     USer is logged out when session is expired.
    */
    onLogOut?: () => void;

    serverUrl: string;

    /**
     * Does we use cookies to store user / password / security tokens ?
     */
    useCookies?: boolean;

    /**
     * If set, is used as prefix for cookies.
     */
    cookiesPrefix?: string;

    enableLogs?: boolean;
    enableLogError?: boolean;
    enableLogWarn?: boolean;
    enableLogTrace?: boolean;
    enableLogDebug?: boolean;

    authChecker?: Function;
}

export function initialize(params: Params_initialize) {
    g_onLogOut = params.onLogOut;
    g_ws_url = params.serverUrl;
    g_ws_authChecker = params.authChecker;

    if (params.enableLogs) {
        if (params.enableLogDebug) g_logDebug = true;
        if (params.enableLogError) g_logError = true;
        if (params.enableLogTrace) g_logTrace = true;
        if (params.enableLogWarn) g_logWarn = true;
    }

    if (params.useCookies!==false) {
        g_useCookies = true;
        g_cookiesPrefix = params.cookiesPrefix;
    }

    if (!g_cookiesPrefix) g_cookiesPrefix = '';
}

// ***************************************************************************************************** WebService call

let g_ws_sessionId: string;
let g_ws_securityToken: string;
let g_ws_authChecker: Function | undefined;

export class WSError extends Error {
    infos: any;
    code: string;

    constructor(message: string, code: string, infos?: any) {
        super(message);
        this.code = code;
        this.infos = infos;
    }
}

function url_applySecurityToken(url: string): string {
    if (!g_actorInfos) return url;

    // Reprend le token depuis les cookies.
    // Nécessaire car celui-ci change si se connecte dans une autre appli.
    // Par exemple, dans l'app administrateur.

    let token: string;

    if (g_useCookies) {
        token = getCookie(g_cookiesPrefix + 'user.securityToken');
        g_actorInfos.securityToken = g_ws_securityToken;
    }
    else {
        token =  g_actorInfos.securityToken;
    }

    return url + '&_tk=' + token;
}

interface WSRes<T> {
    error: any;
    success: T;
}

function WS_POST<T>(service: string, group: string, uriParams?: object|null, postParams?: object|null): Promise<WSRes<T>> {
    ws_checkSecurity(service, group);

    let url = g_ws_url +'&_s=' + service + '&_sg=' + group;
    url = url_applySecurityToken(url);

    // Ajoute le token de session.
    //
    if (group!='core') {
        postParams = postParams || {};
        postParams['_session_id'] = <string>g_ws_sessionId;
    }

    if (uriParams) {
        for (let k in uriParams) {
            if (uriParams.hasOwnProperty(k)) {
                let param: any = uriParams[k];
                if ((param!==null)&&(param!==undefined)) url += '&' + k + '=' + encodeURI(uriParams[k]);
            }
        }
    }

    let pro = new Promise<WSRes<T>>((resolve, reject) => {
        let hdl = atomic(url, {
            method: 'POST',
            data: postParams
        });

        hdl.catch(function(err) {
            if (g_logError) {
                console.groupCollapsed("Error " + err.status + " - POST call on webservice " + service + (group ? '@' + group : ''));
                console.error("Call params", { url: url, service: service, group: group });
                console.error("URI params"); console.log(uriParams);
                console.error("Post params"); console.log(postParams);
                console.error("Response infos"); console.log(err);
                console.groupEnd();
            }

            reject(err);
        });

        hdl.then((res) => {
            resolve(res.data);
        });
    });

    pro.then(function(res: WSRes<T>) {
        if (ws_isError(res)) {
            throw(new WSError('Error calling service ' + service + '@' + group, res.error ? res.error.code : '?', res.error));
        }

        return res;
    });

    pro.then(function(res: WSRes<T>) {
        if (g_logTrace) {
            console.groupCollapsed("SUCCESS - POST call on webservice " + service + (group ? '@' + group : ''));
            console.log("Call params", { url: url, service: service, group: group });
            console.log("URI params :"); console.log(uriParams);
            console.log("Post params"); console.log(postParams);
            console.log("Response :"); console.log(res);
            console.groupEnd();
        }

        return res;
    });

    return pro;
}

function ws_isError<T>(wsRes: WSRes<T>): boolean {
    if (wsRes.error) return true;
    return !wsRes.success;
}

function ws_checkSecurity(service: string, group: string): void {
    if (group==='core') return;

    // Vérifie qu'il n'y a pas eu déconnection / reconnection
    // dans un autre onglet, avec un acteur différent.
    //
    if (g_actorInfos) {
        let isConnected = getCookie('user.logged');

        if (isConnected==='0') {
            alert('Security : You are disconnected in another panel');
            if (g_onLogOut) g_onLogOut();
            throw new Error('Security exception');
        }

        let actorId = g_actorInfos['id'];
        let expectedActor = getCookie('user.login');

        if (expectedActor && (expectedActor!==actorId)) {
            alert('Security : An other user is connected with your navigator');
            if (g_onLogOut) g_onLogOut();
            throw new Error('Security exception');
        }
    }

    if (g_ws_authChecker && !g_ws_authChecker(service, group)) throw new Error('Security exception');
}

// ************************************************************************************************************** Actors

let g_actorInfos: ActorInfos;

export interface ActorRole {
    roleDN: string;
    roleTitle: string;

    processDN: string;
    processTitle: string;
}

export interface DevModInfos {
    /**
     * Ask to disable required fields checking.
     * Allow to speed manuals tests.
     */
    disableRequiredFieldChecking?: boolean
}

export interface ActorInfos {
    id: string;
    name: string;
    forename: string;
    fullName: string;
    lang: string;
    roles: {[roleKey: string]: ActorRole};

    securityToken: string;
    sessionId: string;
    devMode?: object
}

export interface AvailableDocTypeInfos {
    docTypeDN: string;
    docTypeTitle: string;
    processDN: string;
    processTitle: string;
    roleDN: string;
    roleTitle: string;
    operationDN: string;
    operationTitle: string;
}

export interface AvailableViewInfos {
    name: string;
    title: string;
}


export function actor_logIn(login: string, password: string): Promise<ActorInfos> {
    return WS_POST(
        'user_login', 'core', null,
        {login: login, pwd: password}
    ).then(function (json: WSRes<ActorInfos>) {
        if (!json.success) {
            if (g_logError) console.error("Can't login user " + login + "|" + password);
            throw new Error("Can't login user"); // Will call th catch part of promise.
        }

        g_actorInfos = json.success;
        g_ws_sessionId = g_actorInfos.sessionId;

        if (g_useCookies) {
            setCookie(g_cookiesPrefix + 'user.logged', '1');
            setCookie(g_useCookies + 'user.login', login);
            setCookie(g_cookiesPrefix + 'user.password', password);
            setCookie(g_cookiesPrefix + 'user.securityToken', g_actorInfos.securityToken);
        }

        return g_actorInfos;
    });
}

export function actor_logOut(): Promise<void> {
    return <any>WS_POST('user_logout', 'core').then(function() {
        if (g_useCookies) {
            setCookie(g_cookiesPrefix + 'user.logged', '0');
        }
    });
}

export function actor_getInfos(): ActorInfos {
    return g_actorInfos;
}

export function actor_isAdmin(): boolean {
    if (!g_actorInfos || !g_actorInfos.roles) return false;
    return g_actorInfos.roles['administrator|@workflow'] !== undefined;
}

export function actor_checkSession(): Promise<void> {
    return <any>WS_POST('check_server_session', 'core');
}

export function actor_getAvailablesDocTypes(): Promise<AvailableDocTypeInfos[]> {
    return WS_POST('availables_doctypes', 'workflow')
        .then<AvailableDocTypeInfos[]>(function(res: WSRes<AvailableDocTypeInfos[]>) { return res.success; });
}

export function actor_getAvailablesViews(): Promise<AvailableViewInfos[]> {
    return WS_POST<AvailableViewInfos[]>('availables_views', 'workflow')
        .then(function(res: WSRes<AvailableViewInfos[]>) { return res.success; });
}


// ************************************************************************************************************** Drafts

export interface FormItem {
    type: string;
    field?: string;

    title?: string;
    placeholder?: string;

    htmlClass?: string;
    htmlAttrs?: {[attr: string]: string|number|boolean};
    extraHtml?: string;

    items?: FormItem[];
    required?: boolean;
    readOnly?: boolean;
    multiValued?: boolean;

    emptyValue?: string;
    options?: object;

    //[other: string]: any;
}

export interface Draft {
    /**
     * The document id from which this draft is created.
     */
    docId: string;

    /**
     * The draft id.
     * Is not set if readonly.
     */
    draftId?: string;

    /**
     * Is the document / draft readonly ?
     */
    readOnly: boolean;

    title: string;
    docTypeName: string;
    docTypeTitle: string;

    processName: string;
    processTitle: string;
    processVersion: string;

    stateName: string;
    stateTitle: string;

    actorId: string;
    actorRole: string;

    values: object;

    formName: string;
    formTitle: string;
    form: FormItem[];

    /**
     * List of availables operations.
     * Is not set if readonly.
     */
    operations?: DraftOperation[];
}

export interface DraftOperation {
    name: string;
    title: string;
    states: DraftOperationState[];
}

export interface DraftOperationState {
    name: string;
    title: string;
}

export interface Params_draft_submitDraft {
    draftId: string;
    selectedOperation: string;
    selectedState: string;

    formValues?: object;
    newAttachments?: string[];
    removedAttachments?: string[];

    /**
     * Check required fields.
     * Return null of fields invalid fields.
     *
     * @param {object} values
     * @returns {string[]}
     */
    requiredFieldsChecker?: (values: object) => string[];

    /**
     * Check if files are uploading to server.
     * @returns {boolean}
     */
    uploadChecker?: () => boolean;
}

export interface DraftSubmitedInfos {
    docId?: string;
    messages?: UserMessages;
}

export interface UserMessages {
    infoMessage?: string;
    errorMessage?: string;
    requiredFields?: string[];
    errorFields?: {[fieldName: string]: string};
}


export function draft_newDraft(processDN: string, docTypeDN: string, roleDN: string, processVersion?: string): Promise<Draft> {
    return WS_POST<Draft>('new_draft', 'workflow', { process: processDN, doctype: docTypeDN, role: roleDN, processVersion: processVersion })
        .then(function(res) { return res.success; });
}

export function draft_refreshDraft(draftId: string, values: object): Promise<Draft> {
    return WS_POST<Draft>('refresh_draft', 'workflow', {id: draftId}, values)
        .then(function(res) { return res.success; });
}

export function draft_submitDraft(params: Params_draft_submitDraft): Promise<DraftSubmitedInfos> {
    let values = params.formValues;
    if (!values) values = {};

    if (params.newAttachments) values['__newAttachments__'] = params.newAttachments;
    if (params.removedAttachments) values['__removedAttachments__'] = params.removedAttachments;

    let actorInfos = actor_getInfos(),
        disableRequiredFieldChecking = actorInfos.devMode && actorInfos.devMode['disableRequiredFieldChecking'];

    if (!disableRequiredFieldChecking) {
        if (params.requiredFieldsChecker) {
            let requiredFields = params.requiredFieldsChecker(values);
            if (requiredFields) throw new WSError('Required fields have no values', 'REQUIRED_FIELDS', {'fields': requiredFields});
        }
    }

    if (params.uploadChecker && params.uploadChecker())
        throw new WSError('File are uploading, must wait', 'UPLOADING_FILES');

    return WS_POST(
        'submit_draft', 'workflow',
        { id: params.draftId, 'op': params.selectedOperation, 'state': params.selectedState },
        values).then(function (wsRes: WSRes<DraftSubmitedInfos>) { return wsRes.success; });
}

export function draft_openDoc(docId: string, role?: string): Promise<Draft> {
    return WS_POST<Draft>('open_doc', 'workflow', { id: docId, role: role })
        .then(function(res) { return res.success; });
}


// *************************************************************************************************************** Views

export interface Params_view_getView {
    viewName: string;
    pageSize: number;
    pageOffset?: number;

    addViewInfos?: boolean;
}

export interface ViewRowSet {
    rows?: any[];
    infos?: ViewInfos;
}

export interface ViewInfos {
    designerName: string;
    title: string;

    rowCount: number;
    columns: ViewColumn[];
    actions?: ViewAction[];
}

export interface ViewColumn {
    designerName: string;
    title: string;
    htmlStyle?: string;
    htmlClass?: string;

    escapeHTML?: boolean;

    isHidden?: boolean;

    // Si définie, rend la cellule cliquable.
    // Si "open-doc" alors lien url.
    // Sinon appel onRowAction.
    //
    clickAction?: string;

    singleValueWidget?: string;
    multiValueWidget?: string;

    sort?: string;
    format?: string;
    formatExpr?: string;

    widgetOptions?: {[option: string]: any};
}

export interface ViewAction {
    designerName: string;
    title: string;

    icon?: string;
    minSelection?: number;
    maxSelection?: number;
    requireConfirm?: boolean;
}

export function view_getView(params: Params_view_getView): Promise<ViewRowSet> {
    if (!params.pageSize) params.pageSize = 100;
    if (!params.pageOffset) params.pageOffset = 0;

    let wsParams = {
        view: params.viewName,
        page: params.pageOffset,
        size: params.pageSize,
        infos: params.addViewInfos ? 1 : 0
    };

    return WS_POST<ViewRowSet>('get_view', 'workflow', wsParams)
        .then(function(res) { return res.success; });
}


// ********************************************************************************************************* Attachments

export interface Params_attachments_download {
    isTemp: boolean;
    fileId: string;
    fileType: string;
    fileName: string;
}

export function attachments_download(params: Params_attachments_download) {
    let isTemp = params.isTemp;
    let fileId = params.fileId;
    let fileType = params.fileType;
    let fileName = params.fileName;

    let url = g_ws_url;
    if (isTemp) url += '&_s=temp_file'; else url += '&_s=file';
    url += '&_sg=workflow';

    url += '&file=' + fileId;
    url += '&type=' + fileType;
    url += '&name=' + fileName;

    window.open(url,'_blank');
}
