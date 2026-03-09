// cspell:disable
export interface ApiTemplate {
    name: string;
    method: string;
    url: string;
    headers?: string;
    body?: string;
    category: string;
}

export const OccTemplates: ApiTemplate[] = [
    {
        name: "Get Product",
        method: "GET",
        url: "https://{baseSite}/occ/v2/{baseSite}/products/{productCode}?fields=FULL",
        headers: "Authorization: Bearer {ACCESS_TOKEN}",
        category: "OCC"
    },
    {
        name: "Create Anonymous Cart",
        method: "POST",
        url: "https://{baseSite}/occ/v2/{baseSite}/users/anonymous/carts",
        headers: "Authorization: Bearer {ACCESS_TOKEN}",
        category: "OCC"
    },
    {
        name: "Add Entry to Cart",
        method: "POST",
        url: "https://{baseSite}/occ/v2/{baseSite}/users/{userId}/carts/{cartId}/entries",
        headers: "Authorization: Bearer {ACCESS_TOKEN}\nContent-Type: application/json",
        body: "{\"product\":{\"code\":\"{productCode}\"},\"quantity\":1}",
        category: "OCC"
    },
    {
        name: "Get Cart",
        method: "GET",
        url: "https://{baseSite}/occ/v2/{baseSite}/users/{userId}/carts/{cartId}?fields=FULL",
        headers: "Authorization: Bearer {ACCESS_TOKEN}",
        category: "OCC"
    },
    {
        name: "Search Products",
        method: "GET",
        url: "https://{baseSite}/occ/v2/{baseSite}/products/search?query={query}&pageSize=20",
        headers: "Authorization: Bearer {ACCESS_TOKEN}",
        category: "OCC"
    },
    {
        name: "Get OAuth Token",
        method: "POST",
        url: "https://{baseSite}/authorizationserver/oauth/token",
        headers: "Content-Type: application/x-www-form-urlencoded",
        body: "grant_type=password&client_id=mobile_android&client_secret=secret&username={email}&password={password}",
        category: "OCC"
    },
    {
        name: "Get Categories",
        method: "GET",
        url: "https://{baseSite}/occ/v2/{baseSite}/catalogs/{catalogId}/{catalogVersion}/categories/{categoryId}",
        headers: "Authorization: Bearer {ACCESS_TOKEN}",
        category: "OCC"
    },
    {
        name: "Place Order",
        method: "POST",
        url: "https://{baseSite}/occ/v2/{baseSite}/users/{userId}/orders?cartId={cartId}",
        headers: "Authorization: Bearer {ACCESS_TOKEN}\nContent-Type: application/json",
        category: "OCC"
    }
];

export const HacTemplates: ApiTemplate[] = [
    {
        name: "HAC – ImpEx Import",
        method: "POST",
        url: "https://{hacHost}/hac/console/impex/import",
        headers: "Content-Type: application/x-www-form-urlencoded",
        body: "scriptContent=INSERT_UPDATE+Product%3Bcode%5Bunique%3Dtrue%5D%3Bname%5Ben%5D%0A%3Btest123%3BTest+Product&maxThreads=4&encoding=UTF-8&validationEnum=IMPORT_STRICT",
        category: "HAC"
    },
    {
        name: "HAC – ImpEx Validate",
        method: "POST",
        url: "https://{hacHost}/hac/console/impex/import/validate",
        headers: "Content-Type: application/x-www-form-urlencoded",
        body: "scriptContent=INSERT_UPDATE+Product%3Bcode%5Bunique%3Dtrue%5D%3Bname%5Ben%5D%0A%3Btest123%3BTest+Product&maxThreads=1&encoding=UTF-8&validationEnum=IMPORT_STRICT",
        category: "HAC"
    },
    {
        name: "HAC – FlexibleSearch",
        method: "POST",
        url: "https://{hacHost}/hac/console/flexsearch/execute",
        headers: "Content-Type: application/x-www-form-urlencoded",
        body: "flexibleSearchQuery=SELECT+%7Bpk%7D%2C+%7Bcode%7D+FROM+%7BProduct%7D+WHERE+%7Bcode%7D+%3D+%27{productCode}%27&sqlQuery=&maxCount=200&user=admin&locale=en&commit=false",
        category: "HAC"
    },
    {
        name: "HAC – CronJobs Status",
        method: "GET",
        url: "https://{hacHost}/hac/monitoring/cronjobs",
        headers: "Accept: text/html",
        category: "HAC"
    },
    {
        name: "Solr – Core Status",
        method: "GET",
        url: "https://{solrHost}:8983/solr/admin/cores?action=STATUS&wt=json",
        category: "HAC"
    },
    {
        name: "Solr – Select Query",
        method: "GET",
        url: "https://{solrHost}:8983/solr/{coreName}/select?q={query}&rows=10&wt=json",
        category: "HAC"
    }
];
