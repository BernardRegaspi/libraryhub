# University Library System — Dell PowerEdge Server Specification

**Recommended platform:** Dell PowerEdge R760xs (2U), with Dell PowerEdge R660xs (1U) as the cost/space alternative.

**Workload:** One physical server hosting a fresh Koha installation, ULMS frontend/backend, standalone PostgreSQL for ULMS data, and monitoring/support services. Planning assumption is approximately 300–500 authenticated/logged-in users, not 300–500 continuous simultaneous transactions. Actual capacity must be validated through load testing.

## 1. Preferred procurement target — PowerEdge R760xs

| Component | Preferred specification | Minimum procurement position |
|---|---|---|
| Server | Dell PowerEdge R760xs 2U | Request exact chassis/backplane and Dell part numbers |
| CPU | Xeon Silver 4510 (12 cores / 24 threads) or a compatible 16-core option | One CPU initially; request a separate quote for the 16-core option |
| Memory | 256 GB DDR5 ECC RDIMM preferred | 128 GB ECC RDIMM minimum, with a documented upgrade path to 256 GB |
| Boot | BOSS-N1 with 2 × M.2 NVMe drives in RAID 1, if compatible with final build | Mirrored boot volume, separate from data drives |
| Data storage | 4 × 1.92 TB enterprise SSD in RAID 10 | 4 × 960 GB enterprise SSD in RAID 10; verify endurance class and compatibility |
| RAID controller | PERC H755 or Dell-supported equivalent for the chosen drive/backplane | Verify cache/battery protection and RAID 10 support |
| Network | 10/25GbE NIC preferred if supported by campus switching | Dual 1GbE minimum; quote optics/transceivers/cables separately |
| Power | Dual redundant hot-plug PSUs (1+1) | Confirm correct wattage for the final CPU/drive/NIC configuration and 220–240V input |
| Management | iDRAC Enterprise, TPM 2.0, Secure Boot | Restrict iDRAC to the IT management VLAN |
| Warranty | 3-year ProSupport with next-business-day onsite service or better | Confirm Philippines coverage and component coverage |
| Accessories | Rails, cable-management arm, bezel, power cords | Confirm rack depth and PDU compatibility |

Why R760xs: Dell's R760xs is a 2U, dual-socket-capable server platform with 16 DDR5 RDIMM slots and supported configurations up to 1.5 TB RAM. Its available storage configurations include up to 16 × 2.5-inch drives. Exact capabilities vary by chassis, processor, backplane, risers, and selected options; request the official configuration sheet for the quoted build.

## 2. Alternative — PowerEdge R660xs

Use the R660xs if 1U rack space or an attractive price is more important than storage expansion. It is also dual-socket capable and has 16 DDR5 RDIMM slots, with supported configurations up to 1.5 TB. Dell lists up to 10 × 2.5-inch front drives in supported configurations. For this workload, it is less expandable than the R760xs but still a credible alternative if the final quote includes sufficient RAM and enterprise SSD storage.

## 3. Indicative Philippine listing prices

These are listing prices observed on 15 November 2026, not binding quotations and not prices for the complete target specification:

| Model/listing | Approximate listing price | Important note |
|---|---:|---|
| R760xs, Benson Computers | ₱421,200 | Listed configuration included one Xeon Silver 4510, only 16 GB RAM, one 1.2 TB 10K SAS HDD, H755, redundant PSUs, iDRAC Enterprise, and 3-year ProSupport. Not production-ready as listed. |
| R660xs, Benson Computers | ₱400,800 | Listed configuration included one Xeon Silver 4510, only 16 GB RAM and one 1.2 TB 10K SAS HDD. Not production-ready as listed. |
| R760xs, NET-BRIDGE 12 × 3.5-inch / Xeon Silver 4514Y | ₱478,504.46 displayed discounted price (₱562,946.43 listed before discount) | Listed with 16 GB RAM and a single 2 TB drive; not the required production configuration. |

**Budget reality:** Your ₱350,000–₱550,000 budget is close to the price of some base server configurations. A fully upgraded R760xs with 128–256 GB RAM, four enterprise SSDs, mirrored boot, redundant power, support, and required accessories may exceed the cap. Obtain itemized quotes for both R760xs and R660xs with 128 GB and 256 GB RAM alternatives. Do not assume a listed base price includes the needed RAM/SSD upgrades.

## 4. Suggested VM layout on the new physical host

Deploy Proxmox VE and keep each major application stack in a separate VM. The following are initial resource allocations, not guaranteed sizing. On a 128 GB host, start near the lower end and retain at least 16 GB for Proxmox and burst capacity. A 256 GB host is preferred.

| VM | Starting vCPU | RAM allocation | Services |
|---|---:|---:|---|
| VM 1 — Koha | 8 | 32 GB initially; 48 GB if required | Supported Debian + Koha, its MariaDB database, and Koha-supported search/index service |
| VM 2 — ULMS | 6–8 | 16–24 GB | Next.js, FastAPI, Nginx, optional Redis/Celery workers |
| VM 3 — PostgreSQL | 6–8 | 32–48 GB | Standalone PostgreSQL for ULMS, migrations, backup agents |
| VM 4 — Monitoring/support | 4 | 8–16 GB | Prometheus, Grafana, OpenTelemetry collector; Redis if not co-located |
| Proxmox/reserve | Host reserve | 16–32 GB | Hypervisor overhead, filesystem cache, burst headroom |

vCPU totals may exceed physical cores because they are virtual allocations. Do not aggressively overcommit CPU for Koha indexing or PostgreSQL. Adjust allocations after measuring real workload, CPU ready time, memory pressure, database I/O latency, and p95/p99 response times.

## 5. Storage and backup layout

- Use the mirrored BOSS boot volume for Proxmox boot/system if supported by the chosen configuration.
- Use the four SSD RAID 10 array for VM data. Keep database I/O on enterprise SSDs; do not use one mechanical HDD as the only data disk.
- Confirm write endurance (DWPD/TBW), power-loss protection, drive firmware, hot-swap compatibility, and Dell support status.
- Keep database backups on a separate NAS/backup server, not only on the R760xs. Replicate critical backups offsite under university policy.
- Provide a UPS sized for the server, network equipment, and safe shutdown runtime.
- RAID is not a backup. The single physical server remains one hardware failure domain even with separate VMs.

## 6. Capacity and acceptance testing

300–500 logged-in accounts do not automatically mean 300–500 active requests at the same time. Measure expected peak active concurrency and test both normal and stress conditions.

Use k6 to simulate the real library journeys:

- Login/session renewal and department dashboard access.
- Catalog search and item availability lookups through Koha API.
- Staff patron lookup.
- Approved checkout/check-in/renewal operations (only after API and policies are verified).
- Reports, notifications, imports, and background jobs running during peak hours.

Suggested staged load profile: 50, 100, 150, 300, and 500 virtual users, with both read-heavy and transaction-heavy scenarios. Capture p50/p95/p99 latency, error rate, CPU, RAM, PostgreSQL query/lock behavior, Koha API latency, search/index load, disk latency/IOPS, and network throughput. Do not promise 500 active users until these tests pass with representative data.

## 7. Procurement request checklist

Ask resellers to quote both R760xs and R660xs with:

1. 128 GB RAM configuration and 256 GB RAM configuration.
2. 4 × 960 GB and 4 × 1.92 TB enterprise SSD RAID 10 options.
3. Mirrored BOSS-N1 boot option, PERC H755/equivalent, redundant PSUs, iDRAC Enterprise.
4. Full CPU details, memory part numbers/speed, drive endurance class, RAID cache/protection, NIC model, transceiver/cable costs, rails, and power cords.
5. Itemized tax-inclusive pricing, delivery, installation, and 3-year onsite support terms.
6. A clear upgrade path to 256 GB RAM and additional SSD capacity.

## 8. Vendor listing references checked 15 November 2026

- Benson Computers R760xs listing: https://benson.ph/products/dell-poweredge-r760xs-rack-server
- Benson Computers R660xs listing: https://benson.ph/products/dell-poweredge-r660xs-rack-server
- NET-BRIDGE R760xs listing: https://net-bridge.ph/ph/products/poweredge-r760xs-4514y-12x35-1x16gb-1x2tb-2x800w-psu
- Dell PowerEdge R760xs technical guide: https://www.dell.com/en-us/shop/ipovw/poweredge-r760xs
- Dell PowerEdge R660xs technical guide: https://www.dell.com/en-us/shop/ipovw/poweredge-r660xs
