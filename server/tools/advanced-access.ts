/** Operations that observe data and cannot execute source supplied by the model. */
const reads=new Set([
 'system_info','system_memory_info','system_cpu_info','system_disk_info','system_gpu_info','system_installed_apps','system_network_info',
 'computer_clipboard_read','computer_ui_tree','files_hash','code_search','symbol_search',
 'sql_query','schema_inspect','table_list','database_search','retrieve_chunks','rerank','retrieval_search',
 'media_inspect','video_probe','image_metadata','audio_read','document_to_markdown','document_ocr',
 'web_search_news','web_search_images','web_crawl','network_dns_lookup','network_port_check','network_ping','task_list',
]);
export const isAdvancedReadTool=(name:string)=>reads.has(name);
