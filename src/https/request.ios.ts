import { File, ImageSource, Utils } from '@nativescript/core';
import { CacheOptions, HttpsFormDataParam, HttpsRequest, HttpsRequestOptions, HttpsResponse, HttpsSSLPinningOptions, HttpsResponseLegacy as IHttpsResponseLegacy } from '.';
import { getFilenameFromUrl, parseJSON } from './request.common';
export { addInterceptor, addNetworkInterceptor } from './request.common';

let cache: NSURLCache;

export function setCache(options?: CacheOptions) {
    if (options) {
        cache = NSURLCache.alloc().initWithMemoryCapacityDiskCapacityDiskPath(options.memorySize, options.diskSize, options.diskLocation);
    } else {
        cache = null;
    }
    NSURLCache.sharedURLCache = cache;
}

export function clearCache() {
    NSURLCache.sharedURLCache.removeAllCachedResponses();
}

interface Ipolicies {
    def: AFSecurityPolicy;
    secured: boolean;
    secure?: AFSecurityPolicy;
}

const policies: Ipolicies = {
    def: AFSecurityPolicy.defaultPolicy(),
    secured: false
};

policies.def.allowInvalidCertificates = true;
policies.def.validatesDomainName = false;

const configuration = NSURLSessionConfiguration.defaultSessionConfiguration;
let manager = AFHTTPSessionManager.alloc().initWithSessionConfiguration(configuration);

export function enableSSLPinning(options: HttpsSSLPinningOptions) {
    const url = NSURL.URLWithString(options.host);
    manager = AFHTTPSessionManager.alloc().initWithSessionConfiguration(configuration).initWithBaseURL(url);
    if (!policies.secure) {
        policies.secure = AFSecurityPolicy.policyWithPinningMode(AFSSLPinningMode.PublicKey);
        policies.secure.allowInvalidCertificates = Utils.isDefined(options.allowInvalidCertificates) ? options.allowInvalidCertificates : false;
        policies.secure.validatesDomainName = Utils.isDefined(options.validatesDomainName) ? options.validatesDomainName : true;
        const data = NSData.dataWithContentsOfFile(options.certificate);
        policies.secure.pinnedCertificates = NSSet.setWithObject(data);
    }
    policies.secured = true;
}

export function disableSSLPinning() {
    policies.secured = false;
}

function nativeToObj(data) {
    let content: any;
    if (data instanceof NSDictionary) {
        content = {};
        data.enumerateKeysAndObjectsUsingBlock((key, value, stop) => {
            content[key] = nativeToObj(value);
        });
        return content;
    } else if (data instanceof NSArray) {
        content = [];
        data.enumerateObjectsUsingBlock((value, index, stop) => {
            content[index] = nativeToObj(value);
        });
        return content;
    } else if (data instanceof NSData) {
        return NSString.alloc().initWithDataEncoding(data, NSASCIIStringEncoding).toString();
    } else {
        return data;
    }
}

function getData(data) {
    let content: any;
    if (data && data.class) {
        if (data.enumerateKeysAndObjectsUsingBlock || data instanceof NSArray) {
            const serial = NSJSONSerialization.dataWithJSONObjectOptionsError(data, NSJSONWritingOptions.PrettyPrinted);
            content = NSString.alloc().initWithDataEncoding(serial, NSUTF8StringEncoding).toString();
        } else if (data instanceof NSData) {
            content = NSString.alloc().initWithDataEncoding(data, NSASCIIStringEncoding).toString();
        } else {
            content = data;
        }

        try {
            content = JSON.parse(content);
        } catch (ignore) {}
    } else if (typeof data === 'object') {
        content = JSON.stringify(data);
    } else {
        content = data;
    }
    return content;
}

class HttpsResponseLegacy implements IHttpsResponseLegacy {
    //     private callback?: com.nativescript.https.OkhttpResponse.OkHttpResponseAsyncCallback;
    constructor(private data: NSDictionary<string, any> & NSData & NSArray<any>, public contentLength, private url: string) {}
    toArrayBufferAsync(): Promise<ArrayBuffer> {
        throw new Error('Method not implemented.');
    }

    arrayBuffer: ArrayBuffer;
    toArrayBuffer() {
        if (!this.data) {
            return null;
        }
        if (this.arrayBuffer) {
            return this.arrayBuffer;
        }
        if (this.data instanceof NSData) {
            this.arrayBuffer = interop.bufferFromData(this.data);
        } else {
            this.arrayBuffer = interop.bufferFromData(NSKeyedArchiver.archivedDataWithRootObject(this.data));
        }
        return this.arrayBuffer;
    }
    stringResponse: string;
    toString(encoding?: any) {
        if (!this.data) {
            return null;
        }
        if (this.stringResponse) {
            return this.stringResponse;
        }
        if (this.jsonResponse) {
            this.stringResponse = JSON.stringify(this.jsonResponse);
            return this.stringResponse;
        }
        if (typeof this.data === 'string') {
            this.stringResponse = this.data;
            return this.data;
        } else {
            const data = nativeToObj(this.data);
            if (typeof data === 'string') {
                this.stringResponse = data;
            } else {
                this.jsonResponse = data;
                this.stringResponse = JSON.stringify(data);
            }
            return this.stringResponse;
        }
    }
    toStringAsync(encoding?: any) {
        return Promise.resolve(this.toString(encoding));
    }
    jsonResponse: any;
    toJSON(encoding?: any) {
        if (!this.data) {
            return null;
        }
        if (this.jsonResponse) {
            return this.jsonResponse;
        }
        if (this.stringResponse) {
            this.jsonResponse = parseJSON(this.stringResponse);
            return this.jsonResponse;
        }
        const data = nativeToObj(this.data);
        if (typeof data === 'object') {
            this.jsonResponse = data;
            return data;
        }
        try {
            this.stringResponse = data;
            this.jsonResponse = parseJSON(data);
            return this.jsonResponse;
        } catch (err) {
            console.error('HttpsResponse.toJSON', err);
            return null;
        }
    }
    toJSONAsync(): Promise<any> {
        return Promise.resolve(this.toJSON());
    }
    imageSource: ImageSource;
    toImage(): Promise<ImageSource> {
        if (!this.data) {
            return Promise.resolve(null);
        }
        if (this.imageSource) {
            return Promise.resolve(this.imageSource);
        }
        return new Promise<ImageSource>((resolve, reject) => {
            (UIImage as any).tns_decodeImageWithDataCompletion(this.data, (image) => {
                if (image) {
                    resolve(new ImageSource(image));
                } else {
                    reject(new Error('Response content may not be converted to an Image'));
                }
            });
        }).then((r) => {
            this.imageSource = r;
            return r;
        });
    }
    file: File;
    toFile(destinationFilePath?: string): Promise<File> {
        if (!this.data) {
            return Promise.resolve(null);
        }
        if (this.file) {
            return Promise.resolve(this.file);
        }
        return new Promise<File>((resolve, reject) => {
            if (!destinationFilePath) {
                destinationFilePath = getFilenameFromUrl(this.url);
            }
            if (this.data instanceof NSData) {
                // ensure destination path exists by creating any missing parent directories
                const file = File.fromPath(destinationFilePath);

                const result = this.data.writeToFileAtomically(destinationFilePath, true);
                if (resolve) {
                    resolve(file);
                } else {
                    reject(new Error(`Cannot save file with path: ${destinationFilePath}.`));
                }
            } else {
                reject(new Error(`Cannot save file with path: ${destinationFilePath}.`));
            }
        }).then((f) => {
            this.file = f;
            return f;
        });
    }
}

function AFFailure(resolve, reject, task: NSURLSessionDataTask, error: NSError, useLegacy: boolean, url) {
    if (error.code === -999) {
        return reject(new Error(error.localizedDescription));
    }
    let getHeaders = () => ({});
    const sendi = {
        task,
        contentLength: task?.countOfBytesReceived,
        reason: error.localizedDescription,
        get headers() {
            return getHeaders();
        }
    } as any as HttpsResponse;
    const response = error.userInfo.valueForKey(AFNetworkingOperationFailingURLResponseErrorKey) as NSHTTPURLResponse;
    if (!Utils.isNullOrUndefined(response)) {
        sendi.statusCode = response.statusCode;
        getHeaders = function () {
            const dict = response.allHeaderFields;
            if (dict) {
                const headers = {};
                dict.enumerateKeysAndObjectsUsingBlock((k, v) => (headers[k] = v));
                return headers;
            }
            return null;
        };
    }

    const data: NSDictionary<string, any> & NSData & NSArray<any> = error.userInfo.valueForKey(AFNetworkingOperationFailingURLResponseDataErrorKey);
    const parsedData = getData(data);
    const failingURL = error.userInfo.objectForKey('NSErrorFailingURLKey');
    if (useLegacy) {
        if (!sendi.statusCode) {
            return reject(error.localizedDescription);
        }
        const failure: any = {
            description: error.description,
            reason: error.localizedDescription,
            url: failingURL ? failingURL.description : url
        };
        if (policies.secured === true) {
            failure.description = '@nativescript-community/https > Invalid SSL certificate! ' + error.description;
        }
        sendi.failure = failure;
        sendi.content = new HttpsResponseLegacy(data, sendi.contentLength, url);
        resolve(sendi);
    } else {
        const response: any = {
            body: parsedData,
            contentLength: sendi.contentLength,
            description: error.description,
            reason: error.localizedDescription,
            url: failingURL ? failingURL.description : url
        };

        if (policies.secured === true) {
            response.description = '@nativescript-community/https > Invalid SSL certificate! ' + response.description;
        }
        sendi.content = parsedData;
        sendi.response = response;

        resolve(sendi);
    }
}

function bodyToNative(cont) {
    let dict;
    if (Array.isArray(cont)) {
        dict = NSArray.arrayWithArray(cont.map((item) => bodyToNative(item)));
    } else if (Utils.isObject(cont)) {
        dict = NSMutableDictionary.new<string, any>();
        Object.keys(cont).forEach((key) => dict.setValueForKey(bodyToNative(cont[key]), key));
    } else {
        dict = cont;
    }
    return dict;
}

const runningRequests: { [k: string]: NSURLSessionDataTask } = {};

export function cancelRequest(tag: string) {
    if (runningRequests[tag]) {
        runningRequests[tag].cancel();
    }
}

export function cancelAllRequests() {
    Object.values(runningRequests).forEach((request) => {
        request.cancel();
    });
}

export function clearCookies() {
    const storage = NSHTTPCookieStorage.sharedHTTPCookieStorage;
    const cookies = storage.cookies;
    cookies.enumerateObjectsUsingBlock((cookie) => {
        storage.deleteCookie(cookie);
    });
}
export function createRequest(opts: HttpsRequestOptions, useLegacy: boolean = true): HttpsRequest {
    const type = opts.headers && opts.headers['Content-Type'] ? opts.headers['Content-Type'] : 'application/json';
    if (type.startsWith('application/json')) {
        manager.requestSerializer = AFJSONRequestSerializer.serializer();
        manager.responseSerializer = AFJSONResponseSerializer.serializerWithReadingOptions(NSJSONReadingOptions.AllowFragments);
    } else {
        manager.requestSerializer = AFHTTPRequestSerializer.serializer();
        manager.responseSerializer = AFHTTPResponseSerializer.serializer();
    }
    manager.requestSerializer.allowsCellularAccess = true;
    manager.requestSerializer.HTTPShouldHandleCookies = opts.cookiesEnabled !== false;
    manager.securityPolicy = policies.secured === true ? policies.secure : policies.def;

    if (opts.cachePolicy) {
        switch (opts.cachePolicy) {
            case 'noCache':
                manager.setDataTaskWillCacheResponseBlock((session, task, cacheResponse) => null);
                break;
            case 'onlyCache':
                manager.requestSerializer.cachePolicy = NSURLRequestCachePolicy.ReturnCacheDataDontLoad;
                break;
            case 'ignoreCache':
                manager.requestSerializer.cachePolicy = NSURLRequestCachePolicy.ReloadIgnoringLocalCacheData;
                break;
        }
    } else {
        manager.requestSerializer.cachePolicy = NSURLRequestCachePolicy.UseProtocolCachePolicy;
    }
    const heads = opts.headers;
    let headers: NSMutableDictionary<string, any> = null;
    if (heads) {
        headers = NSMutableDictionary.dictionary();
        Object.keys(heads).forEach(
            (key) => headers.setValueForKey(heads[key], key)
            // manager.requestSerializer.setValueForHTTPHeaderField(
            //     heads[key] as any,
            //     key
            // )
        );
    }

    let dict = null;
    if (opts.body) {
        dict = NSJSONSerialization.JSONObjectWithDataOptionsError(NSString.stringWithString(JSON.stringify(opts.body)).dataUsingEncoding(NSUTF8StringEncoding), 0 as any);
    } else if (opts.content) {
        dict = NSJSONSerialization.JSONObjectWithDataOptionsError(NSString.stringWithString(opts.content).dataUsingEncoding(NSUTF8StringEncoding), 0 as any);
    }

    manager.requestSerializer.timeoutInterval = opts.timeout ? opts.timeout : 10;

    const progress = opts.onProgress
        ? (progress: NSProgress) => {
              opts.onProgress(progress.completedUnitCount, progress.totalUnitCount);
          }
        : null;
    let task: NSURLSessionDataTask;
    const tag = opts.tag;

    function clearRunningRequest() {
        if (tag) {
            delete runningRequests[tag];
        }
    }
    return {
        get nativeRequest() {
            return task;
        },
        cancel: () => task && task.cancel(),
        run(resolve, reject) {
            const success = function (task: NSURLSessionDataTask, data?: any) {
                clearRunningRequest();
                // TODO: refactor this code with failure one.
                const contentLength = task.countOfBytesReceived;
                const content = useLegacy ? new HttpsResponseLegacy(data, contentLength, opts.url) : getData(data);
                let getHeaders = () => ({});
                const sendi = {
                    content,
                    contentLength,
                    get headers() {
                        return getHeaders();
                    }
                } as any as HttpsResponse;

                const response = task.response as NSHTTPURLResponse;
                if (!Utils.isNullOrUndefined(response)) {
                    sendi.statusCode = response.statusCode;
                    getHeaders = function () {
                        const dict = response.allHeaderFields;
                        if (dict) {
                            const headers = {};
                            dict.enumerateKeysAndObjectsUsingBlock((k, v) => (headers[k] = v));
                            return headers;
                        }
                        return null;
                    };
                }
                resolve(sendi);

                // if (AFResponse.reason) {
                //     sendi.reason = AFResponse.reason;
                // }
            };
            const failure = function (task: NSURLSessionDataTask, error: any) {
                clearRunningRequest();
                AFFailure(resolve, reject, task, error, useLegacy, opts.url);
            };
            if (type.startsWith('multipart/form-data')) {
                switch (opts.method) {
                    case 'POST':
                        // we need to remove the Content-Type or the boundary wont be set correctly
                        headers.removeObjectForKey('Content-Type');
                        task = manager.POSTParametersHeadersConstructingBodyWithBlockProgressSuccessFailure(
                            opts.url,
                            null,
                            headers,
                            (formData) => {
                                (opts.body as HttpsFormDataParam[]).forEach((param) => {
                                    if (param.fileName && param.contentType) {
                                        if (param.data instanceof NSURL) {
                                            formData.appendPartWithFileURLNameFileNameMimeTypeError(param.data, param.parameterName, param.fileName, param.contentType);
                                        } else {
                                            let data = param.data;
                                            if (typeof data === 'string') {
                                                data = NSString.stringWithString(data).dataUsingEncoding(NSUTF8StringEncoding);
                                            }
                                            formData.appendPartWithFileDataNameFileNameMimeType(data, param.parameterName, param.fileName, param.contentType);
                                        }
                                    } else {
                                        formData.appendPartWithFormDataName(NSString.stringWithString(param.data).dataUsingEncoding(NSUTF8StringEncoding), param.parameterName);
                                    }
                                });
                            },
                            progress,
                            success,
                            failure
                        );
                        break;
                    default:
                        throw new Error('method_not_supported_multipart');
                }
            } else {
                switch (opts.method) {
                    case 'GET':
                        task = manager.GETParametersHeadersProgressSuccessFailure(opts.url, dict, headers, progress, success, failure);
                        break;
                    case 'POST':
                        task = manager.POSTParametersHeadersProgressSuccessFailure(opts.url, dict, headers, progress, success, failure);
                        break;
                    case 'PUT':
                        task = manager.PUTParametersHeadersSuccessFailure(opts.url, dict, headers, success, failure);
                        break;
                    case 'DELETE':
                        task = manager.DELETEParametersHeadersSuccessFailure(opts.url, dict, headers, success, failure);
                        break;
                    case 'PATCH':
                        task = manager.PATCHParametersHeadersSuccessFailure(opts.url, dict, headers, success, failure);
                        break;
                    case 'HEAD':
                        task = manager.HEADParametersHeadersSuccessFailure(opts.url, dict, headers, success, failure);
                        break;
                    default:
                        throw new Error('method_not_supported_multipart');
                }
            }
            if (task && tag) {
                runningRequests[tag] = task;
            }
        }
    };
}
export function request(opts: HttpsRequestOptions, useLegacy: boolean = true) {
    return new Promise((resolve, reject) => {
        try {
            createRequest(opts, useLegacy).run(resolve, reject);
        } catch (error) {
            reject(error);
        }
    });
}

// Android only
export function getClient(opts: Partial<HttpsRequestOptions>) {
    return undefined;
}
