export interface ImpExTemplate {
    id: string
    name: string
    category: string
    description: string
    script: string
}

export const IMPEX_TEMPLATES: ImpExTemplate[] = [
    {
        id: 'user-export',
        name: 'Export Customers',
        category: 'Users',
        description: 'Standard export for customer accounts including basic profile data.',
        script: `# Export Customers
INSERT_UPDATE Customer;uid[unique=true];name;customerID;groups(uid);sessionLanguage(isocode);sessionCurrency(isocode)
;customer1@example.com;John Doe;C-001;customergroup;en;USD
;customer2@example.com;Jane Smith;C-002;customergroup;en;EUR`
    },
    {
        id: 'product-price',
        name: 'Update Prices',
        category: 'Products',
        description: 'Update base prices for products in a specific price row.',
        script: `# Update Product Prices
INSERT_UPDATE PriceRow;product(code,catalogVersion(catalog(id),version))[unique=true];price;currency(isocode)[unique=true];unit(code)[unique=true];net[default=true]
;123456:apparelProductCatalog:Online;19.99;USD;pieces;true
;789012:apparelProductCatalog:Online;24.50;USD;pieces;true`
    },
    {
        id: 'stock-level',
        name: 'Update Stock Levels',
        category: 'Products',
        description: 'Update stock levels for specific products and warehouses.',
        script: `# Update Stock Levels
INSERT_UPDATE StockLevel;productCode[unique=true];warehouse(code)[unique=true];available;reserved
;123456;default;150;0
;789012;default;75;10`
    },
    {
        id: 'category-sync',
        name: 'Catalog Sync Trigger',
        category: 'Catalog',
        description: 'Trigger a synchronization for a specific catalog version.',
        script: `# Start Sync Job
INSERT_UPDATE CatalogVersionSyncJob;code[unique=true];sourceVersion(catalog(id),version);targetVersion(catalog(id),version)
;sync-apparelProductCatalog-Staged-To-Online;apparelProductCatalog:Staged;apparelProductCatalog:Online`
    },
    {
        id: 'media-import',
        name: 'Media Folder Setup',
        category: 'Infrastructure',
        description: 'Create new media folders and configure storage strategies.',
        script: `# Create Media Folder
INSERT_UPDATE MediaFolder;qualifier[unique=true];path[unique=true]
;customImages;images/custom
;reports;documents/reports`
    }
]
