"""SAP import query — edit this file (and only this file) when you change the
query you want to pull from the warehouse.

The query must return at least an ``ItemCode`` and ``ItemName`` column. Every
other column is preserved verbatim in the preview and is available to the
mapping step that builds product rows.
"""
IMPORT_QUERY = """
;WITH FMCG AS
(
    SELECT
        P.ItemCode,
        P.ItemName,

        [PRIX STANDARD],
        [Tarifs AMA],
        [DETAIL],
        [DETAIL NET],
        [DETAIL SPOT],
        [SUB.D],

        [GROS],
        [GROS NET],
        [GROS NET EXW],
        [GROS SPOT],
        [GROS SUD],
        [DEMI GROS],

        [GMS],
        [GMS CARREFOUR LABEL VIE],
        [ASWAK ASSALAM],
        [ATACADAO],
        [BIM STORES],
        [KAZYON],
        [GLOVO],

        [FORECAST]

    FROM
    (
        SELECT
            IT1.ItemCode,
            IT.ItemName,
            PL.ListName,
            IT1.Price

        FROM db_FMCG.dbo.ITM1 IT1

        INNER JOIN db_FMCG.dbo.OITM IT
            ON IT.ItemCode = IT1.ItemCode

        INNER JOIN db_FMCG.dbo.OPLN PL
            ON PL.ListNum = IT1.PriceList
    ) SRC

    PIVOT
    (
        MAX(Price)
        FOR ListName IN
        (
            [DETAIL],
            [DETAIL NET],
            [DETAIL SPOT],

            [GROS],
            [GROS NET],
            [GROS NET EXW],
            [GROS SPOT],
            [GROS SUD],
            [DEMI GROS],

            [GMS],
            [GMS CARREFOUR LABEL VIE],
            [ASWAK ASSALAM],
            [ATACADAO],
            [BIM STORES],
            [KAZYON],

            [PRIX STANDARD],
            [Tarifs AMA],
            [FORECAST],
            [SUB.D],
            [GLOVO]
        )
    ) P
),

AMA AS
(
    SELECT
        P.ItemCode,
        [PRIX STANDARD] AS AMA_PRIX_STANDARD,
        [Publique] AS AMA_PUBLIQUE

    FROM
    (
        SELECT
            IT1.ItemCode,
            PL.ListName,
            IT1.Price

        FROM db_AMA.dbo.ITM1 IT1

        INNER JOIN db_AMA.dbo.OPLN PL
            ON PL.ListNum = IT1.PriceList

        WHERE PL.ListName IN ('PRIX STANDARD', 'Publique')
    ) SRC

    PIVOT
    (
        MAX(Price)
        FOR ListName IN
        (
            [PRIX STANDARD],
            [Publique]
        )
    ) P
)

SELECT
    F.*,
    A.AMA_PRIX_STANDARD,
    A.AMA_PUBLIQUE

FROM FMCG F

LEFT JOIN AMA A
    ON A.ItemCode = F.ItemCode

ORDER BY F.ItemCode
"""

# Default mapping from SAP columns → plan_commercial product fields. Applied
# by /api/sap/import when the caller doesn't supply an override. Swap the
# right-hand strings when you decide which prices to use.
DEFAULT_MAPPING = {
    "nom":                     "ItemName",
    "prix_gros":               "GROS",
    "prix_gros_net":           "GROS NET",
    "colisage_prix_gros":      "GROS",
    "colisage_prix_gros_net":  "GROS NET",
}
