import type {LicenseDecision} from './types.ts';
/** Unknown declarations fail closed; a root label cannot overrule nested terms. */
export function classifyLicense(text:string):{decision:LicenseDecision;label:string;reason?:string}{
 // Match an actual prohibition, not separate sentences in Apache's appendix
 // ("may not use ... except in compliance" followed by "distributed ...").
 if(/proprietary|\bUNLICENSED\b|\bmay not[^.!?]{0,1200}\b(?:distribut\w*|derivative|reproduc\w*|copy|sublicen\w*|transfer)\b|LicenseRef-/i.test(text))return {decision:'restricted',label:'Restricted terms',reason:'Source-specific permission is required before distribution or adaptation'};
 if(/GNU (?:GENERAL|AFFERO)|AGPL|GPL-3|CC-BY-SA|FSL-1/i.test(text))return {decision:'unresolved',label:'Additional license obligations',reason:'Package-level distribution obligations have not been approved'};
 if(/Apache License[\s\S]{0,60}Version 2\.0|\bApache-2\.0\b/i.test(text))return {decision:'allowed',label:'Apache-2.0'};
 if(/MIT License|\bMIT\b|Permission is hereby granted, free of charge/i.test(text))return {decision:'allowed',label:'MIT'};
 if(/CC0|Creative Commons Zero/i.test(text))return {decision:'allowed',label:'CC0-1.0'};
 if(/Creative Commons Attribution 4\.0|\bCC[- ]BY[- ]4\.0\b/i.test(text))return {decision:'allowed',label:'CC-BY-4.0'};
 if(/BSD[ -][23][ -]Clause|Redistribution and use in source and binary forms/i.test(text))return {decision:'allowed',label:'BSD'};
 return {decision:'unresolved',label:'License unresolved',reason:'No reviewed distribution permission is available for this package'};
}
