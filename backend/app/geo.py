from __future__ import annotations

CITY_BY_PREFIX: dict[str, str] = {
    "00": "Roma", "01": "Viterbo", "02": "Rieti", "03": "Frosinone", "04": "Latina",
    "05": "Terni", "06": "Perugia", "07": "Sassari", "08": "Nuoro", "09": "Cagliari",
    "10": "Torino", "11": "Aosta", "12": "Cuneo", "13": "Vercelli", "14": "Asti",
    "15": "Alessandria", "16": "Genova", "17": "Savona", "18": "Imperia", "19": "La Spezia",
    "20": "Milano", "21": "Varese", "22": "Como", "23": "Sondrio", "24": "Bergamo",
    "25": "Brescia", "26": "Cremona", "27": "Pavia", "28": "Novara", "29": "Piacenza",
    "30": "Venezia", "31": "Treviso", "32": "Belluno", "33": "Udine", "34": "Trieste",
    "35": "Padova", "36": "Vicenza", "37": "Verona", "38": "Trento", "39": "Bolzano",
    "40": "Bologna", "41": "Modena", "42": "Reggio Emilia", "43": "Parma", "44": "Ferrara",
    "45": "Rovigo", "46": "Mantova", "47": "Forli", "48": "Ravenna", "49": "Rimini",
    "50": "Firenze", "51": "Pistoia", "52": "Arezzo", "53": "Siena", "54": "Massa",
    "55": "Lucca", "56": "Pisa", "57": "Livorno", "58": "Grosseto", "59": "Prato",
    "60": "Ancona", "61": "Pesaro", "62": "Macerata", "63": "Ascoli Piceno", "64": "Teramo",
    "65": "Pescara", "66": "Chieti", "67": "L'Aquila", "68": "Pescara", "69": "Campobasso",
    "70": "Bari", "71": "Foggia", "72": "Brindisi", "73": "Lecce", "74": "Taranto",
    "75": "Matera", "76": "Potenza", "80": "Napoli", "81": "Caserta", "82": "Benevento",
    "83": "Avellino", "84": "Salerno", "85": "Potenza", "86": "Campobasso", "87": "Cosenza",
    "88": "Crotone", "89": "Vibo Valentia",
    "90": "Palermo", "91": "Trapani", "92": "Agrigento", "93": "Caltanissetta", "94": "Enna",
    "95": "Catania", "96": "Ragusa", "97": "Siracusa", "98": "Messina", "99": "Catania",
}

PALLET_ZONES: dict[int, str] = {
    1: "Zona 1 · Stessa area",
    2: "Zona 2 · Media distanza",
    3: "Zona 3 · Lunga distanza",
}


def city_for_cap(cap: str) -> str:
    return CITY_BY_PREFIX.get(cap[:2], "Italia")


def _macro_area(cap: str) -> int:
    digit = int(cap[0]) if cap[:1].isdigit() else 5
    if digit <= 2:
        return 0
    if digit <= 6:
        return 1
    return 2


def pallet_zone(origin_cap: str, dest_cap: str) -> int:
    distance = abs(_macro_area(origin_cap) - _macro_area(dest_cap))
    return max(1, min(3, distance + 1))
